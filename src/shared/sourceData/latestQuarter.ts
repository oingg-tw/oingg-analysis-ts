import { getLatestQuarterWithBalanceSheet, getLatestQuarterWithIncomeStatement, getLatestQuarterWithCashFlowStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getLatestQuarterWithBalanceSheetXbrl } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getLatestQuarterWithIncomeStatementXbrl } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getLatestQuarterWithXbrlCashFlowQuarterly } from '@/shared/sourceData/xbrlCashFlowQuarterly';
import type { Season } from '@/shared/rocQuarter';

// 不同公司財報申報進度不同步（不是理論上的擔心，是實測驗證過的：2887 資產負債表/現金流量表已經到
// 115Q1，損益表卻卡在 114Q2，中間差 3 季），所以「這家公司財報最新到哪一季」不能只查單一張表——
// 要看呼叫端這支指標實際會用到哪幾張表，取這幾張表「都有資料」的最新一季（交集），不是任一張表
// 自己的最新一季，否則會誤判成有資料、實際上缺欄位那一季，一樣算不出來，等於沒解決問題。
export type StatementSource = 'balanceSheet' | 'incomeStatement' | 'cashFlowStatement';

// 2026-09-10 修正：這支函式原本只查舊三大表，沒有查 XBRL 寬表——實測驗證過這是真的會
// 踩到的 bug，不是理論上的擔心：2887 的 quarterly_balance_sheet_xbrl 已經有 115Q2，
// 舊表 quarterly_balance_sheet 卻還停在 115Q1，只查舊表會把「最新一季」誤判成
// 115Q1，明明 XBRL 已經有更新的資料。改成兩邊都查，取較新的那個——XBRL 通常涵蓋較新
// 季度、舊表涵蓋較舊季度（XBRL 申報要求生效前的歷史資料），兩者不是純粹的子集關係，
// 「哪張表有資料」本身無法預先假設，只能兩邊都查再比較。
const findLatestQuarterFor = async (
  source: StatementSource,
  symbol: string,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<{ year: number; quarter: number } | null> => {
  const [xbrlLatest, legacyLatest] = await Promise.all([
    source === 'balanceSheet'
      ? getLatestQuarterWithBalanceSheetXbrl(symbol, dataType, subsidiaryCompanyId)
      : source === 'incomeStatement'
        ? getLatestQuarterWithIncomeStatementXbrl(symbol, dataType, subsidiaryCompanyId)
        : getLatestQuarterWithXbrlCashFlowQuarterly(symbol, dataType, subsidiaryCompanyId),
    source === 'balanceSheet'
      ? getLatestQuarterWithBalanceSheet(symbol, dataType, subsidiaryCompanyId)
      : source === 'incomeStatement'
        ? getLatestQuarterWithIncomeStatement(symbol, dataType, subsidiaryCompanyId)
        : getLatestQuarterWithCashFlowStatement(symbol, dataType, subsidiaryCompanyId),
  ]);

  if (!xbrlLatest) return legacyLatest;
  if (!legacyLatest) return xbrlLatest;

  const toOrdinal = (q: { year: number; quarter: number }) => q.year * 4 + q.quarter;
  return toOrdinal(xbrlLatest) >= toOrdinal(legacyLatest) ? xbrlLatest : legacyLatest;
};

// 指標不給 year/season 時，用這支自動解析「這家公司、這幾張表都有資料的最新一季」。
// sources 由呼叫端指定這支指標實際需要哪幾張表（例如 roe 需要 ['balanceSheet', 'incomeStatement']，
// cashFlowPerShare 需要 ['cashFlowStatement']）——取每張表各自最新一季裡最早的那個（交集下界），
// 保證回傳的季度這幾張表都真的有資料，不是只有其中一張。任一張表完全查無資料就回傳 null。
export const getLatestAvailableQuarter = async (
  symbol: string,
  dataType: string,
  subsidiaryCompanyId: string,
  sources: StatementSource[]
): Promise<{ year: string; season: Season } | null> => {
  const latests = await Promise.all(sources.map((source) => findLatestQuarterFor(source, symbol, dataType, subsidiaryCompanyId)));

  if (latests.some((l) => l === null)) return null;

  const toOrdinal = (q: { year: number; quarter: number }) => q.year * 4 + q.quarter;
  const earliest = latests.reduce((min, curr) => (toOrdinal(curr!) < toOrdinal(min!) ? curr : min))!;

  return { year: String(earliest.year), season: String(earliest.quarter) as Season };
};
