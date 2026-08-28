import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { LiquidityRatioQuery, LiquidityRatioResult } from './types';

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

export const calculateLiquidityRatio = async (query: LiquidityRatioQuery): Promise<LiquidityRatioResult> => {
  const { companyId, year, season, dataType, subsidiaryCompanyId } = query;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const warnings: string[] = [];

  const balanceSheet = await prisma.quarterlyBalanceSheet.findUnique({
    where: {
      symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
    },
  });

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

  // 存進 oingg-analysis DB 的 solvency_liquidity_ratio，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.liquidityRatioResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: companyId,
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
    console.error('[liquidity-ratio]: 寫入 solvency_liquidity_ratio 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
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
    warnings,
  };
};
