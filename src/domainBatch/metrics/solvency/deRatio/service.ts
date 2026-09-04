import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet } from '@/shared/sourceData/mopsQuarterlyStatements';
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

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): DeRatioResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  deRatioPct: null,
  totalDebt: { value: null },
  equity: { fieldUsed: null, value: null },
  warnings,
});

export const calculateDeRatio = async (query: DeRatioQuery): Promise<DeRatioResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表有資料」的最新一季——不同公司財報
  // 申報進度不同步（實測驗證過：2887 損益表曾經卡在比資產負債表舊 3 季），見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined ? { year: query.year, season: query.season } : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表有資料的季度，無法決定要用哪一季計算負債權益比。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId });

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
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: symbol, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: symbol,
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
    symbol,
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
