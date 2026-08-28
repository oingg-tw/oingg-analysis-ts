import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPaidInSharesAsOf } from '@/shared/capitalStock';
import type { NcavQuery, NcavResult } from './types';

// 財報金額欄位單位是「千元」，但流通股數是實際股數，不是千股，兩者單位不同，
// 分子要先換算成元（x1000）才能除，否則會差 1000 倍（BVPS 曾踩過這個坑）。
const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100; // 四捨五入到小數 2 位
};

export const calculateNcav = async (query: NcavQuery): Promise<NcavResult> => {
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
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  // 只計入分類為權益的特別股；分類為金融負債的特別股（preferredStockLiability）已經算在
  // totalLiabilities 裡面，重複扣會低估 NCAV。查不到欄位視為 0（沒有特別股），不是資料缺漏。
  const preferredStock = balanceSheet?.preferredStockCapital ?? 0n;

  if (balanceSheet && currentAssets === null) {
    warnings.push('該季資產負債表流動資產欄位為 null，無法計算 NCAV——常見於金融/保險業，資產負債表不採流動/非流動分類，NCAV 這個公式本來就不適用這類公司。');
  }
  if (balanceSheet && totalLiabilities === null) warnings.push('該季資產負債表總負債欄位為 null，無法計算 NCAV。');
  if (balanceSheet?.preferredStockCapital && balanceSheet.preferredStockCapital > 0n) {
    warnings.push('本季有分類為權益的特別股（preferredStockCapital），已從 NCAV 分子扣除。');
  }

  const reportDate = balanceSheet?.reportDate ?? null;

  let paidInShares: bigint | null = null;
  let effectiveYear: number | null = null;
  let effectiveMonth: number | null = null;
  if (reportDate) {
    const shares = await getPaidInSharesAsOf(companyId, reportDate);
    if (shares) {
      paidInShares = shares.paidInShares;
      effectiveYear = shares.effectiveYear;
      effectiveMonth = shares.effectiveMonth;
    } else {
      warnings.push('查無本季報告日之前生效的股本歷史資料（capital_stock_history），無法計算 NCAV。');
    }
  }
  if (paidInShares !== null && paidInShares <= 0n) warnings.push('流通股數為零或負數，NCAV 數值意義有限，請自行判斷是否採用。');

  let ncav: number | null = null;
  let marginOfSafetyPrice: number | null = null;
  if (currentAssets !== null && totalLiabilities !== null && paidInShares !== null) {
    const netCurrentAssetValue = currentAssets - totalLiabilities - preferredStock;
    ncav = toPerShare(netCurrentAssetValue, paidInShares);
    if (ncav !== null) marginOfSafetyPrice = Math.round(((ncav * 2) / 3) * 100) / 100;
  }

  // 存進 oingg-analysis DB 的 guru_ncav，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.ncavResult.upsert({
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
        ncav,
        marginOfSafetyPrice,
        currentAssetsValue: currentAssets,
        totalLiabilitiesValue: totalLiabilities,
        preferredStockValue: preferredStock,
        paidInShares,
        capitalStockEffectiveYear: effectiveYear,
        capitalStockEffectiveMonth: effectiveMonth,
        warnings,
      },
      update: {
        reportDate,
        ncav,
        marginOfSafetyPrice,
        currentAssetsValue: currentAssets,
        totalLiabilitiesValue: totalLiabilities,
        preferredStockValue: preferredStock,
        paidInShares,
        capitalStockEffectiveYear: effectiveYear,
        capitalStockEffectiveMonth: effectiveMonth,
        warnings,
      },
    });
  } catch (error) {
    console.error('[ncav]: 寫入 guru_ncav 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    ncav,
    marginOfSafetyPrice,
    currentAssets: { value: currentAssets?.toString() ?? null },
    totalLiabilities: { value: totalLiabilities?.toString() ?? null },
    preferredStock: { value: preferredStock.toString() },
    paidInShares: {
      value: paidInShares?.toString() ?? null,
      effectiveYear,
      effectiveMonth,
    },
    warnings,
  };
};
