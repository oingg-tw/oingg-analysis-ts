import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/mops/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';

// 2026-09-13 使用者要求擴大稽核鏈——currentRatio/quickRatio/cashRatio 三支都是純資產負債表
// 時點快照（只有 Q 一種 basis，沒有 TTM 概念，見 computeLiquidityRatioPit.ts 的編排說明），
// 共用完全同一組輸入，抽這支共用 resolver 給 3 支 get<Metric>Provenance.ts 共用。

export interface LiquidityRatioProvenanceInputs {
  symbol: string;
  fiscalYear: number;
  fiscalQuarter: number;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  inventory: bigint | null;
  cashAndEquivalents: bigint | null;
}

export const resolveLiquidityRatioProvenanceInputs = async (query: QuarterlyMetricQuery): Promise<LiquidityRatioProvenanceInputs | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });

  return {
    symbol,
    fiscalYear,
    fiscalQuarter: seasonNum,
    currentAssets: balanceSheet?.currentAssets ?? null,
    currentLiabilities: balanceSheet?.currentLiabilities ?? null,
    inventory: balanceSheet?.inventory ?? null,
    cashAndEquivalents: balanceSheet?.cashAndEquivalents ?? null,
  };
};
