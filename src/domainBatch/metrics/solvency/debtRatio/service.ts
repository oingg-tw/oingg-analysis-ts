import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { DebtRatioQuery, DebtRatioResult } from './types';

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): DebtRatioResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  debtRatioPct: null,
  totalLiabilities: { value: null },
  totalAssets: { value: null },
  warnings,
});

export const calculateDebtRatio = async (query: DebtRatioQuery): Promise<DebtRatioResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表有資料」的最新一季——不同公司財報
  // 申報進度不同步（實測驗證過：2887 損益表曾經卡在比資產負債表舊 3 季），見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined ? { year: query.year, season: query.season } : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表有資料的季度，無法決定要用哪一季計算負債比率。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId });

  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');

  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;
  if (balanceSheet && totalLiabilities === null) warnings.push('該季資產負債表總負債欄位為 null，無法計算。');
  if (balanceSheet && totalAssets === null) warnings.push('該季資產負債表總資產欄位為 null，無法計算。');

  let debtRatioPct: number | null = null;
  if (totalLiabilities !== null && totalAssets !== null) {
    debtRatioPct = toPct(totalLiabilities, totalAssets);
    if (totalAssets <= 0n) warnings.push('本季期末總資產為零或負數，負債比率數值意義有限，請自行判斷是否採用。');
  }

  const reportDate = balanceSheet?.reportDate ?? null;

  // 存進 oingg-analysis DB 的 solvency_debt_ratio，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.debtRatioResult.upsert({
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
        debtRatioPct,
        totalLiabilitiesValue: totalLiabilities,
        totalAssetsValue: totalAssets,
        warnings,
      },
      update: {
        reportDate,
        debtRatioPct,
        totalLiabilitiesValue: totalLiabilities,
        totalAssetsValue: totalAssets,
        warnings,
      },
    });
  } catch (error) {
    console.error('[debt-ratio]: 寫入 solvency_debt_ratio 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    debtRatioPct,
    totalLiabilities: { value: totalLiabilities?.toString() ?? null },
    totalAssets: { value: totalAssets?.toString() ?? null },
    warnings,
  };
};
