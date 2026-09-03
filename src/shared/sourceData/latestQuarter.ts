import { getLatestQuarterWithBalanceSheet, getLatestQuarterWithIncomeStatement, getLatestQuarterWithCashFlowStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { Season } from '@/shared/rocQuarter';

// 不同公司財報申報進度不同步（不是理論上的擔心，是實測驗證過的：2887 資產負債表/現金流量表已經到
// 115Q1，損益表卻卡在 114Q2，中間差 3 季），所以「這家公司財報最新到哪一季」不能只查單一張表——
// 要看呼叫端這支指標實際會用到哪幾張表，取這幾張表「都有資料」的最新一季（交集），不是任一張表
// 自己的最新一季，否則會誤判成有資料、實際上缺欄位那一季，一樣算不出來，等於沒解決問題。
export type StatementSource = 'balanceSheet' | 'incomeStatement' | 'cashFlowStatement';

const findLatestQuarterFor = async (
  source: StatementSource,
  companyId: string,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<{ year: number; quarter: number } | null> => {
  if (source === 'balanceSheet') {
    return getLatestQuarterWithBalanceSheet(companyId, dataType, subsidiaryCompanyId);
  }
  if (source === 'incomeStatement') {
    return getLatestQuarterWithIncomeStatement(companyId, dataType, subsidiaryCompanyId);
  }
  return getLatestQuarterWithCashFlowStatement(companyId, dataType, subsidiaryCompanyId);
};

// 指標不給 year/season 時，用這支自動解析「這家公司、這幾張表都有資料的最新一季」。
// sources 由呼叫端指定這支指標實際需要哪幾張表（例如 roe 需要 ['balanceSheet', 'incomeStatement']，
// cashFlowPerShare 需要 ['cashFlowStatement']）——取每張表各自最新一季裡最早的那個（交集下界），
// 保證回傳的季度這幾張表都真的有資料，不是只有其中一張。任一張表完全查無資料就回傳 null。
export const getLatestAvailableQuarter = async (
  companyId: string,
  dataType: string,
  subsidiaryCompanyId: string,
  sources: StatementSource[]
): Promise<{ year: string; season: Season } | null> => {
  const latests = await Promise.all(sources.map((source) => findLatestQuarterFor(source, companyId, dataType, subsidiaryCompanyId)));

  if (latests.some((l) => l === null)) return null;

  const toOrdinal = (q: { year: number; quarter: number }) => q.year * 4 + q.quarter;
  const earliest = latests.reduce((min, curr) => (toOrdinal(curr!) < toOrdinal(min!) ? curr : min))!;

  return { year: String(earliest.year), season: String(earliest.quarter) as Season };
};
