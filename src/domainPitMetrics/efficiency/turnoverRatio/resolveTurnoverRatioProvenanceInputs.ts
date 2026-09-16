import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/infrastructure/repositories/mops/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';

// 2026-09-13 使用者要求擴大稽核鏈涵蓋範圍——inventoryTurnover/receivablesTurnover/
// fixedAssetTurnover/payablesTurnover 這 4 支周轉率共用完全同一組輸入（本季期末資產負債表
// 餘額當分母、近四季損益表加總當分子），跟 computeTurnoverRatioFamilyPit.ts 查詢的資料
// 完全一樣，這裡抽一個共用 resolver 給 4 支 get<Metric>Provenance.ts 共用，不是各自重複
// 查 4 次。刻意不動 computeTurnoverRatioFamilyPit.ts 本身（現查現算不持久化，跟
// getRoeProvenance.ts 同一個模式）。固定回傳 TTM（跟既有試點慣例一致）。
export interface TurnoverRatioProvenanceInputs {
  symbol: string;
  fiscalYear: number;
  fiscalQuarter: number;
  inventory: bigint | null;
  accountsReceivable: bigint | null;
  propertyPlantEquipment: bigint | null;
  accountsPayable: bigint | null;
  // 2026-09-13 新增，給 netWorkingCapitalTurnover 用——currentAssets/currentLiabilities
  // 本身也各自是完整的原始欄位，稽核鏈要分開列出兩筆，不是只列相減後的淨營運資金。
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  ttmQuarters: { year: string; season: string }[];
  ttmOperatingCosts: (bigint | null)[];
  ttmOperatingRevenues: (bigint | null)[];
  ttmComplete: boolean;
  costTtmSum: bigint;
  revenueTtmSum: bigint;
}

export const resolveTurnoverRatioProvenanceInputs = async (query: QuarterlyMetricQuery): Promise<TurnoverRatioProvenanceInputs | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await getQuarterlyBalanceSheet(key);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const ttmOperatingCosts = ttmRecords.map((record) => record?.operatingCost ?? null);
  const ttmOperatingRevenues = ttmRecords.map((record) => record?.operatingRevenue ?? null);

  let costTtmSum = 0n;
  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.operatingCost === null || record.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      costTtmSum += record.operatingCost;
      revenueTtmSum += record.operatingRevenue;
    }
  }

  return {
    symbol,
    fiscalYear,
    fiscalQuarter: seasonNum,
    inventory: balanceSheet?.inventory ?? null,
    accountsReceivable: balanceSheet?.accountsReceivable ?? null,
    propertyPlantEquipment: balanceSheet?.propertyPlantEquipment ?? null,
    accountsPayable: balanceSheet?.accountsPayable ?? null,
    currentAssets: balanceSheet?.currentAssets ?? null,
    currentLiabilities: balanceSheet?.currentLiabilities ?? null,
    ttmQuarters,
    ttmOperatingCosts,
    ttmOperatingRevenues,
    ttmComplete,
    costTtmSum,
    revenueTtmSum,
  };
};
