import { getLatestAvailableQuarter } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { BankOperatingExpenseFields } from '@/application/ports/financialStatements';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { calculateBankEmployeeBenefitsExpensePerShare } from '@/domain/metrics/profitability/bankEmployeeBenefitsExpensePerShare/calculateBankEmployeeBenefitsExpensePerShare';
import { calculateBankDepreciationAmortisationExpensePerShare } from '@/domain/metrics/profitability/bankDepreciationAmortisationExpensePerShare/calculateBankDepreciationAmortisationExpensePerShare';
import { calculateBankGeneralAdministrativeExpensePerShare } from '@/domain/metrics/profitability/bankGeneralAdministrativeExpensePerShare/calculateBankGeneralAdministrativeExpensePerShare';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, withFormulaVersion } from '@/domain/metrics/computation';
import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-28 銀行／金控營業費用三分拆（使用者：「做」）：營業費用 = 員工福利 + 折舊及攤銷 + 其他業務及管理費用
// （mops-ts 查 taxonomy：這個母項就只有這 3 個子科目；115Q2 20 家逐家差額 0，單季與累計各自閉合，110Q3 起每季 18~20 家）。
// 三支加總還原 operatingExpensePerShare（web-nuxt 的營業費用組成圖用同一個恆等式守門）。
// 只算金融業、而且這一季有「其他業務及管理費用」的公司（銀行與金控格式才有，判斷理由見下方）——券商（母項是「支出及費用合計」）、保險、一般業沒有這組科目，
// 整批跳過不寫（跟 bankIncomeWaterfall 一樣「從未寫入」，徽章與前端據此判斷不適用），不寫一堆 missing_input。
// 資料來源的 coalesce（銀行表 vs 金控表）在 repository（bankIncomeStatementXbrl.ts getBankOperatingExpenseQuarter）。
export const BANK_OPERATING_EXPENSE_BREAKDOWN_FORMULA_VERSION = 1;

const COMPONENTS = [
  { code: 'bankEmployeeBenefitsExpensePerShare', pick: (r: BankOperatingExpenseFields) => r.employeeBenefits, calc: calculateBankEmployeeBenefitsExpensePerShare },
  { code: 'bankDepreciationAmortisationExpensePerShare', pick: (r: BankOperatingExpenseFields) => r.depreciationAmortisation, calc: calculateBankDepreciationAmortisationExpensePerShare },
  { code: 'bankGeneralAdministrativeExpensePerShare', pick: (r: BankOperatingExpenseFields) => r.otherGeneralAdministrative, calc: calculateBankGeneralAdministrativeExpensePerShare },
] as const;

type SlotName = `${(typeof COMPONENTS)[number]['code']}${'Q' | 'Ttm'}`;
const SLOT_NAMES = COMPONENTS.flatMap((c) => [`${c.code}Q`, `${c.code}Ttm`]) as SlotName[];

export type BankOperatingExpenseBreakdownDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'industry'>;
export type BankOperatingExpenseBreakdownComputationBatch = ComputationBatch<SlotName>;

const skippedAll = (symbol: string): BankOperatingExpenseBreakdownComputationBatch => ({
  symbol,
  rocYear: null,
  season: null,
  slots: Object.fromEntries(SLOT_NAMES.map((s) => [s, { action: 'skipped_no_quarter' }])) as BankOperatingExpenseBreakdownComputationBatch['slots'],
});

const complete = (r: BankOperatingExpenseFields | null): r is BankOperatingExpenseFields =>
  r !== null && r.employeeBenefits !== null && r.depreciationAmortisation !== null && r.otherGeneralAdministrative !== null;

export const computeBankOperatingExpenseBreakdown = async (
  query: QuarterlyMetricQuery,
  deps: BankOperatingExpenseBreakdownDeps
): Promise<BankOperatingExpenseBreakdownComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  if (!(await deps.industry.isFinancialIndustryCompany(symbol))) return skippedAll(symbol);

  const resolved =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement'], deps.quarters);
  if (!resolved) return skippedAll(symbol);

  const rocYear = Number(resolved.year);
  const seasonNum = Number(resolved.season);
  const statement = await deps.statements.getBankOperatingExpense({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  // 這一季沒有這組科目就整批不寫。判斷看「其他業務及管理費用」而不是三項任一：券商（2855、5864、6005…10 家）也申報員工福利與
  // 折舊攤銷（通用 IFRS 科目），但它們的母項是「支出及費用合計」、沒有其他業管這一項——2026-09-28 第一次回填用「三項全空才跳過」，
  // 這 10 家被寫進了員工福利／折舊攤銷，已刪除重跑。其他業管只有銀行與金控格式有。
  if (!statement || statement.otherGeneralAdministrative === null) return skippedAll(symbol);

  const fiscalYear = rocYearToGregorian(rocYear);
  const shares = (await deps.shares.getOutstandingCommonShares(symbol, statement.reportDate))?.outstandingCommonShares ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: statement.reportDate }], deps.announcements);

  // TTM：近四季三個成分都齊才加總（三支共用同一個完整度判斷——它們是同一個恆等式的三塊，只給其中兩塊的近四季沒有意義）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: String(seasonNum) as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getBankOperatingExpense({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const ttmComplete = ttmRecords.every(complete);
  const ttmAnchor = ttmComplete
    ? await resolveKnowledgeDate(symbol, ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]!.reportDate })), deps.announcements)
    : null;

  const base = { symbol, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };
  const slot = (metricCode: string, periodType: 'Q' | 'TTM', result: CalcResult, anchor: typeof mainAnchor): ComputationSlot =>
    anchor
      ? computation({ ...base, metricCode, ...periodTypeGroup(periodType), ...result, knowledgeDate: anchor.knowledgeDate, knowledgeDateIsFallback: anchor.isFallback })
      : { action: 'skipped_no_knowledge_date' };

  const slots = {} as Record<SlotName, ComputationSlot>;
  for (const c of COMPONENTS) {
    slots[`${c.code}Q`] = slot(c.code, 'Q', c.calc(c.pick(statement), shares), mainAnchor);
    slots[`${c.code}Ttm`] = ttmComplete
      ? slot(c.code, 'TTM', c.calc(ttmRecords.reduce((sum, r) => sum + c.pick(r as BankOperatingExpenseFields)!, 0n), shares), ttmAnchor)
      : slot(c.code, 'TTM', { value: null, nullReason: 'insufficient_history' }, mainAnchor);
  }

  return { symbol, rocYear: String(rocYear), season: String(seasonNum), slots: withFormulaVersion(slots, BANK_OPERATING_EXPENSE_BREAKDOWN_FORMULA_VERSION) };
};
