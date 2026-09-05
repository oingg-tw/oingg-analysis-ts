import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus, type MetricResultMeta } from '@/shared/metricStatus';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity } from '@/shared/quarterlyMetric';
import { logger } from '@/shared/logger';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type LiquidityRatioQuery = QuarterlyMetricQuery;

export interface LiquidityRatioResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 流動比率 = 本季期末流動資產 / 本季期末流動負債 * 100
  currentRatioPct: number | null;
  // 速動比率 = (本季期末流動資產 - 存貨) / 本季期末流動負債 * 100
  // 跟負債比率一樣，這是純資產負債表的時點快照，沒有單季/年化/TTM 的區別。
  quickRatioPct: number | null;
  // 現金比率 = 本季期末現金及約當現金 / 本季期末流動負債 * 100
  cashRatioPct: number | null;

  currentAssets: {
    value: string | null; // BigInt as string
  };
  currentLiabilities: {
    value: string | null; // BigInt as string
  };
  inventory: {
    value: string | null; // BigInt as string
  };
  cashAndEquivalents: {
    value: string | null; // BigInt as string
  };
}

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): LiquidityRatioResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  currentRatioPct: null,
  quickRatioPct: null,
  cashRatioPct: null,
  currentAssets: { value: null },
  currentLiabilities: { value: null },
  inventory: { value: null },
  cashAndEquivalents: { value: null },
  fieldStatuses: {},
  warnings,
});

export const calculateLiquidityRatio = async (query: LiquidityRatioQuery): Promise<LiquidityRatioResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表有資料」的最新一季——不同公司財報
  // 申報進度不同步（實測驗證過：2887 損益表曾經卡在比資產負債表舊 3 季），見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined ? { year: query.year, season: query.season } : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表有資料的季度，無法決定要用哪一季計算流動比率/速動比率/現金比率。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId });

  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');

  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const inventory = balanceSheet?.inventory ?? null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  if (balanceSheet && currentAssets === null) warnings.push('該季資產負債表流動資產欄位為 null，無法計算流動比率/速動比率。');
  if (balanceSheet && currentLiabilities === null) warnings.push('該季資產負債表流動負債欄位為 null，無法計算流動比率/速動比率/現金比率。');
  if (balanceSheet && inventory === null) warnings.push('該季資產負債表存貨欄位為 null，無法計算速動比率。');
  if (balanceSheet && cashAndEquivalents === null) warnings.push('該季資產負債表現金及約當現金欄位為 null，無法計算現金比率。');

  let currentRatioPct: number | null = null;
  let quickRatioPct: number | null = null;
  let cashRatioPct: number | null = null;
  if (currentLiabilities !== null) {
    if (currentAssets !== null) {
      currentRatioPct = toPct(currentAssets, currentLiabilities);
      if (inventory !== null) quickRatioPct = toPct(currentAssets - inventory, currentLiabilities);
    }
    if (cashAndEquivalents !== null) cashRatioPct = toPct(cashAndEquivalents, currentLiabilities);
    if (currentLiabilities <= 0n) warnings.push('本季期末流動負債為零或負數，流動比率/速動比率/現金比率數值意義有限，請自行判斷是否採用。');
  }

  const reportDate = balanceSheet?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    currentRatioPct === null ? ['currentRatioPct', { status: 'no_data', message: '本季期末流動資產或流動負債缺漏，無法計算流動比率。' }] : null,
    quickRatioPct === null ? ['quickRatioPct', { status: 'no_data', message: '本季期末流動資產、存貨或流動負債缺漏，無法計算速動比率。' }] : null,
    cashRatioPct === null ? ['cashRatioPct', { status: 'no_data', message: '本季期末現金及約當現金或流動負債缺漏，無法計算現金比率。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 resilience_liquidity_ratio，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.liquidityRatioResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: symbol, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: symbol,
        year: yearNum,
        season: seasonNum,
        dataType,
        subsidiaryCompanyId,
        reportDate,
        currentRatioPct,
        quickRatioPct,
        cashRatioPct,
        currentAssetsValue: currentAssets,
        currentLiabilitiesValue: currentLiabilities,
        inventoryValue: inventory,
        cashAndEquivalentsValue: cashAndEquivalents,
        warnings,
      },
      update: {
        reportDate,
        currentRatioPct,
        quickRatioPct,
        cashRatioPct,
        currentAssetsValue: currentAssets,
        currentLiabilitiesValue: currentLiabilities,
        inventoryValue: inventory,
        cashAndEquivalentsValue: cashAndEquivalents,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[liquidity-ratio]: 寫入 resilience_liquidity_ratio 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    currentRatioPct,
    quickRatioPct,
    cashRatioPct,
    currentAssets: { value: currentAssets?.toString() ?? null },
    currentLiabilities: { value: currentLiabilities?.toString() ?? null },
    inventory: { value: inventory?.toString() ?? null },
    cashAndEquivalents: { value: cashAndEquivalents?.toString() ?? null },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
