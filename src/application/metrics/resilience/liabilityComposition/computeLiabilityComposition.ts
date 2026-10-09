import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { liabilityBreakdown } from '@/domain/financials/liabilityBreakdown';

// 2026-10-09 負債比率拆成流動／非流動（web-nuxt 堆疊長條，使用者決定）：一次查資產負債表，寫 currentLiabilitiesToAssets、
// nonCurrentLiabilitiesToAssets 兩支，分母跟 debtRatio 同一個期末總資產，兩支相加＝debtRatio（流動＋非流動＝負債總計，
// 108Q3～115Q2 非金融業實測 0 筆不等）。純時點快照只有 Q，跟 computeDebtRatio.ts／liquidityRatio 家族同一種形狀。
// 金融業不分流動／非流動，空值由定義檔的 notApplicableToFinancialIndustry 改標不適用。
// 2026-10-09 加逐科目九項（使用者選逐科目拆；規則見 domain/financials/liabilityBreakdown.ts），同一次查詢一起寫。

export type LiabilityCompositionDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

// 九項的 metricCode ↔ liabilityBreakdown 的欄位（溯源也用同一張表）。
export const LIABILITY_BREAKDOWN_CODES = {
  shortTermBorrowingsToAssets: 'shortTermBorrowings',
  accountsPayableToAssets: 'accountsPayable',
  contractLiabilitiesToAssets: 'contractLiabilities',
  currentPortionOfLongTermDebtToAssets: 'currentPortionOfLongTermDebt',
  otherCurrentLiabilitiesToAssets: 'otherCurrentLiabilities',
  longTermBorrowingsToAssets: 'longTermBorrowings',
  bondsPayableToAssets: 'bondsPayable',
  leaseLiabilitiesToAssets: 'leaseLiabilities',
  otherNonCurrentLiabilitiesToAssets: 'otherNonCurrentLiabilities',
} as const;
type BreakdownCode = keyof typeof LIABILITY_BREAKDOWN_CODES;
const BREAKDOWN_CODES = Object.keys(LIABILITY_BREAKDOWN_CODES) as BreakdownCode[];

export type LiabilityCompositionComputationBatch = ComputationBatch<'currentLiabilitiesToAssets' | 'nonCurrentLiabilitiesToAssets' | BreakdownCode>;

const ratio = (part: bigint | null, totalAssets: bigint | null) => {
  const value = part !== null && totalAssets !== null ? toPercent(part, totalAssets) : null;
  return { value, nullReason: value === null ? determineNullReason(part, totalAssets) : null };
};

export const computeLiabilityComposition = async (query: QuarterlyMetricQuery, deps: LiabilityCompositionDeps): Promise<LiabilityCompositionComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);
  if (!resolvedQuarter) return noQuarterBatch(symbol, ['currentLiabilitiesToAssets', 'nonCurrentLiabilitiesToAssets', ...BREAKDOWN_CODES]);

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const current = ratio(balanceSheet?.currentLiabilities ?? null, totalAssets);
  const nonCurrent = ratio(balanceSheet?.noncurrentLiabilities ?? null, totalAssets);
  const breakdown = balanceSheet ? liabilityBreakdown(balanceSheet) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: balanceSheet?.reportDate ?? null }], deps.announcements);
  const slotFor = (metricCode: string, calc: { value: number | null; nullReason: ReturnType<typeof determineNullReason> | null }): ComputationSlot =>
    mainAnchor
      ? computation({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId, ...periodTypeGroup('Q'), value: calc.value, nullReason: calc.nullReason, knowledgeDate: mainAnchor.knowledgeDate, knowledgeDateIsFallback: mainAnchor.isFallback })
      : { action: 'skipped_no_knowledge_date' };

  return {
    symbol,
    rocYear: year,
    season,
    slots: {
      currentLiabilitiesToAssets: slotFor('currentLiabilitiesToAssets', current),
      nonCurrentLiabilitiesToAssets: slotFor('nonCurrentLiabilitiesToAssets', nonCurrent),
      ...(Object.fromEntries(BREAKDOWN_CODES.map((code) => [code, slotFor(code, ratio(breakdown ? breakdown[LIABILITY_BREAKDOWN_CODES[code]] : null, totalAssets))])) as Record<BreakdownCode, ComputationSlot>),
    },
  };
};
