import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { DebtRatioQuery, DebtRatioResult } from './types';

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

export const calculateDebtRatio = async (query: DebtRatioQuery): Promise<DebtRatioResult> => {
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
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: companyId,
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
    companyId,
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
