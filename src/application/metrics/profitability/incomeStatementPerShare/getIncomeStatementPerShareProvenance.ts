import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { IncomeStatementFields } from '@/application/ports/financialStatements';
import { fillAbsentOperatingExpenseComponents } from '@/domain/financials/operatingExpenseComponents';
import { resolveTrailingIncomeStatements, trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { PitDeps } from '@/application/metrics/deps';
import { amountOf, FIELDS, type FieldMetricCode } from './computeIncomeStatementPerShare';

// 2026-10-01 使用者要求「溯源表請務必都加上」——瀑布圖每股家族 17 支共用這一支，用 metricCode 參數化。
// 跟 getRevenuePerShareProvenance/getPretaxIncomePerShareProvenance 同一種形狀：固定回傳 TTM（端點沒有 periodType 參數，
// 試點慣例一律 TTM），近一年各期的原始科目 + 本季報告日當下的流通股數。
//
// 值不在這裡重算公式：pick（讀哪個科目）、calc（每股換算）、amountOf（undefined 正規化）都直接用 compute 的 FIELDS，
// 近一年也走同一個 resolveTrailingIncomeStatements + fillAbsentOperatingExpenseComponents，所以溯源表的 value
// 必然等於 computeIncomeStatementPerShare 寫進 metric_values 的 TTM 值。這裡只多一張「每支指標要列哪些原始欄位」的表
// （COMPONENTS）——兩支相減型指標（業外損益、少數股東損益）要列兩個欄位，單一 pick 函式看不出來。
//
// FY（年報口徑）不在這裡：端點沒有 periodType，跟其餘每股試點一致只給 TTM；之後真的要 FY 再開 periodType 參數。

interface Component {
  label: string;
  fieldKey: string; // 跟 GET /companies/financial-statement 的 XBRL key 一致（見各指標 Definition 的 dependsOn）
  pick: (r: IncomeStatementFields) => bigint | null;
}

const COMPONENTS: Record<FieldMetricCode, Component[]> = {
  grossProfitPerShare: [{ label: '毛利', fieldKey: 'gross_profit', pick: (r) => r.grossProfit }],
  operatingIncomePerShare: [{ label: '營業利益', fieldKey: 'profit_loss_from_operating_activities', pick: (r) => r.operatingIncome }],
  operatingCostsPerShare: [{ label: '營業成本', fieldKey: 'operating_costs', pick: (r) => r.operatingCost }],
  operatingExpensePerShare: [{ label: '營業費用', fieldKey: 'operating_expense', pick: (r) => r.operatingExpense }],
  incomeTaxExpensePerShare: [{ label: '所得稅費用', fieldKey: 'income_tax_expense_continuing_operations', pick: (r) => r.incomeTaxExpense }],
  sellingExpensePerShare: [{ label: '推銷費用', fieldKey: 'selling_expense', pick: (r) => r.sellingExpenses }],
  administrativeExpensePerShare: [{ label: '管理費用', fieldKey: 'administrative_expense', pick: (r) => r.adminExpenses }],
  researchAndDevelopmentExpensePerShare: [{ label: '研究發展費用', fieldKey: 'research_and_development_expense', pick: (r) => r.researchAndDevelopmentExpense }],
  impairmentLossGainIfrs9PerShare: [{ label: '預期信用減損損失（IFRS 9）', fieldKey: 'impairment_loss_gain_reversal_ifrs9', pick: (r) => r.expectedCreditLoss }],
  netOtherIncomeExpensesPerShare: [{ label: '其他收益及費損淨額', fieldKey: 'net_other_income_expenses', pick: (r) => r.netOtherIncomeExpenses }],
  nonOperatingIncomeExpensesPerShare: [
    { label: '稅前淨利', fieldKey: 'profit_loss_before_tax', pick: (r) => r.profitBeforeTax },
    { label: '減：營業利益', fieldKey: 'profit_loss_from_operating_activities', pick: (r) => r.operatingIncome },
  ],
  interestRevenuePerShare: [{ label: '利息收入', fieldKey: 'revenue_from_interest', pick: (r) => r.interestIncome }],
  otherRevenuePerShare: [{ label: '其他收入', fieldKey: 'other_revenue', pick: (r) => r.otherIncome }],
  otherGainsLossesPerShare: [{ label: '其他利益及損失', fieldKey: 'other_gains_losses', pick: (r) => r.otherGainsLosses }],
  shareOfProfitLossOfAssociatesPerShare: [{ label: '採用權益法認列之關聯企業及合資損益份額', fieldKey: 'share_of_profit_loss_of_associates_and_jvs', pick: (r) => r.equityMethodIncome }],
  financeCostPerShare: [{ label: '財務成本', fieldKey: 'finance_costs', pick: (r) => r.financeCosts }],
  nonControllingInterestsPerShare: [
    { label: '本期淨利', fieldKey: 'profit_loss', pick: (r) => r.netIncome },
    { label: '減：歸屬母公司淨利', fieldKey: 'profit_loss_attributable_to_owners_of_parent', pick: (r) => r.netIncomeAttributableToParent },
  ],
};

const DERIVED_NOTES: Partial<Record<FieldMetricCode, string>> = {
  nonOperatingIncomeExpensesPerShare: '業外損益不是財報原始欄位，是每一期「稅前淨利 − 營業利益」相減後加總，再除以流通股數。',
  nonControllingInterestsPerShare: '少數股東損益不是財報原始欄位，是每一期「本期淨利 − 歸屬母公司淨利」相減後加總，再除以流通股數。',
};
const OPEX_FILL_NOTE = '某一期這一行在 XBRL 缺行、而營業費用合計 − 其他已揭露的營業費用項目在 ±1 千元內時，缺行當 0（角色註明「缺行當 0」）；對不上就維持缺值。';
const SEMIANNUAL_NOTE = '興櫃公司採半年頻：上半年取第二季累計數，下半年為全年累計 − 上半年累計。';

export const getIncomeStatementPerShareProvenance = async (
  metricCode: FieldMetricCode,
  query: QuarterlyMetricQuery,
  deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'cumulativeStatements'>
): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const field = FIELDS.find((f) => f.metricCode === metricCode && f.periodTypes[0] === 'TTM')!;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);
  if (!resolvedQuarter) {
    return { symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = incomeStatement?.reportDate ?? null;
  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const sharesValue = shares?.outstandingCommonShares ?? null;

  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const records = trailing.periods.map((p) => p.record && fillAbsentOperatingExpenseComponents(p.record));

  // 跟 compute 同一條規則：每一期都要有紀錄、而且這支指標自己的金額非 null，才加總。
  const complete = records.every((r) => r !== null && amountOf(field, r) !== null);
  const sum = complete ? records.reduce((acc, r) => acc + amountOf(field, r)!, 0n) : null;
  const value = sum !== null ? field.calc(sum, sharesValue).value : null;

  const components = COMPONENTS[metricCode];
  const entries: ProvenanceEntry[] = [
    ...trailing.periods.flatMap((period, i) =>
      components.map((c): ProvenanceEntry => {
        const raw = period.record ? (c.pick(period.record) ?? null) : null;
        const used = records[i] ? (c.pick(records[i]!) ?? null) : null;
        const filled = raw === null && used !== null;
        return {
          role: `近一年 ${c.label}（${trailingPeriodLabel(period, trailing.basis)}${filled ? '，缺行當 0' : ''}）`,
          fiscalYear: rocYearToGregorian(Number(period.year)),
          fiscalQuarter: Number(period.season),
          type: 'statementField',
          statementType: 'incomeStatement',
          fieldKey: c.fieldKey,
          sourceDescription: null,
          value: toProvenanceEntryValue(used),
        };
      })
    ),
    { role: '流通股數（本季報告日當下有效）', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(sharesValue) },
  ];

  const notes = [
    DERIVED_NOTES[metricCode],
    ['sellingExpensePerShare', 'administrativeExpensePerShare', 'researchAndDevelopmentExpensePerShare', 'impairmentLossGainIfrs9PerShare'].includes(metricCode) ? OPEX_FILL_NOTE : undefined,
    trailing.basis === 'semiannual' ? SEMIANNUAL_NOTE : undefined,
  ].filter(Boolean);

  return { symbol, metricCode, found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: notes.length > 0 ? notes.join('') : null };
};
