import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements, trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——fcfConversionRate(TTM) = 近四季自由現金流(FCF=OCF+
// 資本支出)加總 / 近四季淨利加總。跟 computeCashFlowValuationFamilyPit.ts 一致，這裡只
// 重新查這支自己真正的依賴。純財報比率，不涉及股價/市值。只有 TTM 一種 basis。
//
// 注意：分母淨利固定用整體口徑（incomeRecord.netIncome，fieldKey='profit_loss'），
// 不是其他多數指標慣用的「歸屬母公司優先、缺漏退回整體」pickNetIncome 樣式——這是
// 照抄 computeCashFlowValuationFamilyPit.ts 既有寫入路徑的實際欄位選擇，驗證時發現
// 用 pickNetIncome 會跟已寫入的值有微幅落差（2330 51.12 vs 51.13）才確認的。

export const getFcfConversionRateProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'fcfConversionRate', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）；兩張表的 periods 順序相同、逐段配對。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods;
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);
  const netIncomes = ttmRecords.map(([r]) => r?.netIncome ?? null);
  const ocfs = ttmRecords.map(([, r]) => r?.netCashFromOperatingActivities ?? null);
  const capexes = ttmRecords.map(([, r]) => r?.capitalExpenditures ?? null);

  let netIncomeTtmSum = 0n;
  let fcfTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (netIncomes[i] === null || ocfs[i] === null || capexes[i] === null) {
      complete = false;
    } else {
      netIncomeTtmSum += netIncomes[i]!;
      fcfTtmSum += ocfs[i]! + capexes[i]!;
    }
  }

  const value = complete ? toPercent(fcfTtmSum, netIncomeTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `近一年 淨利（${trailingPeriodLabel(tq, trailingIncome.basis)}，整體口徑）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'profit_loss',
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]),
      },
      {
        role: `近一年 營業活動現金流（${trailingPeriodLabel(tq, trailingIncome.basis)}，用於 FCF）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(ocfs[i]),
      },
      {
        role: `近一年 資本支出（${trailingPeriodLabel(tq, trailingIncome.basis)}，用於 FCF，原始資料是負值）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'purchase_of_ppe_investing',
        sourceDescription: null,
        value: toProvenanceEntryValue(capexes[i]),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'fcfConversionRate',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: 'FCF = 營業活動現金流 + 資本支出（資本支出帶負號，相加即為扣除），不是財報原始欄位，是計算出的中繼值，見上方原始欄位。',
  };
};
