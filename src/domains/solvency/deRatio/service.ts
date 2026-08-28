import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { DeRatioQuery, DeRatioResult } from './types';

// 權益欄位選擇邏輯跟 ROE 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickEquity = (
  record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null
): { field: 'equityAttributableToParent' | 'totalEquity' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.equityAttributableToParent !== null) return { field: 'equityAttributableToParent', value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { field: 'totalEquity', value: record.totalEquity };
  return { field: null, value: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

export const calculateDeRatio = async (query: DeRatioQuery): Promise<DeRatioResult> => {
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

  // 短期借款/應付公司債/長期借款三個欄位，任一為 null 視為 0（沒有借那種負債），不是資料缺漏；
  // 只有整張資產負債表查無資料時，totalDebt 才是 null。
  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;

  const equity = pickEquity(balanceSheet);
  if (balanceSheet && equity.value === null) warnings.push('該季資產負債表權益相關欄位皆為 null，無法計算。');

  let deRatioPct: number | null = null;
  if (totalDebt !== null && equity.value !== null) {
    deRatioPct = toPct(totalDebt, equity.value);
    if (equity.value <= 0n) warnings.push('本季期末權益為零或負數，負債權益比數值意義有限，請自行判斷是否採用。');
  }

  const reportDate = balanceSheet?.reportDate ?? null;

  // 存進 oingg-analysis DB 的 solvency_de_ratio，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.deRatioResult.upsert({
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
        deRatioPct,
        totalDebtValue: totalDebt,
        equityFieldUsed: equity.field,
        equityValue: equity.value,
        warnings,
      },
      update: {
        reportDate,
        deRatioPct,
        totalDebtValue: totalDebt,
        equityFieldUsed: equity.field,
        equityValue: equity.value,
        warnings,
      },
    });
  } catch (error) {
    console.error('[de-ratio]: 寫入 solvency_de_ratio 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    deRatioPct,
    totalDebt: { value: totalDebt?.toString() ?? null },
    equity: { fieldUsed: equity.field, value: equity.value?.toString() ?? null },
    warnings,
  };
};
