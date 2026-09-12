import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getIndustryCodes } from './industryCodes';

// 證交所類股分類（跟 industryClassification.ts 的財政部稅籍五層階層是完全不同的分類系統，
// 刻意不合併）——twse-ts 的 export.industry_code（40 筆兩碼代碼→中文名稱，見
// industryCodes.ts）當作代碼字典，twse-ts/tpex-ts 的 export.company_profile.industry
// 欄位當作每家公司的所屬代碼。2026-09-11 應使用者要求新增：screener 產業篩選要用的是投資人
// 熟悉的證交所類股（例如「半導體業」），不是財政部稅籍分類。

// 這 5 個代碼不是真正的產業分類（見 companyProfile.ts 的 NON_INDUSTRY_CODES 同款說明：
// XX=證券商、98=期貨商、91=第一上市外國公司身份別、07=舊產業代碼殘留），瀏覽/篩選都不該
// 把它們當成合法目標。
const NON_INDUSTRY_CODES = new Set(['07', '91', '98', 'XX']);

export const isValidSecuritiesSectorCode = (code: string): boolean => {
  const codes = getIndustryCodes();
  return codes !== null && code in codes && !NON_INDUSTRY_CODES.has(code);
};

// 2026-09-13 新增：Altman Z/Z′/Z″-Score、Beneish M-Score、Ohlson O-Score、Zmijewski
// Score 這 6 個財務危機/操縱偵測模型，全部是用一般產業（製造業為主）樣本校準的迴歸/加權
// 模型，對金融保險業（industry='17'，銀行、金控、保險）套用會系統性失真——這些模型用到的
// 營運資金/總資產、市值/負債帳面值、應收帳款成長率等會計關係，在銀行的資產負債表結構下
// （存款/放款/證券投資，高槓桿是產業常態不是危機訊號）完全不成立，不是「資料缺漏」而是
// 「模型本身不適用」，見 metricBasis.ts 的 not_applicable_industry。只查 twse-ts/tpex-ts
// company_profile.industry，不含 07/91/98/XX 這些非產業代碼（本來就不會等於 '17'）。
export const isFinancialIndustryCompany = async (symbol: string): Promise<boolean> => {
  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<{ industry: string | null }[]>`SELECT industry FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1`,
    tpexExportPrisma.$queryRaw<{ industry: string | null }[]>`SELECT industry FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1`,
  ]);
  const industry = twseRows[0]?.industry ?? tpexRows[0]?.industry ?? null;
  return industry === '17';
};

export interface SecuritiesIndustrySector {
  code: string;
  name: string;
  companyCount: number;
}

interface IndustryCountRow {
  industry: string | null;
  count: bigint;
}

// 給「證券類股瀏覽」用——40 個 twse-ts industry_code 為主體，companyCount 是 TWSE/TPEx 兩邊
// company_profile.industry 分組計數後加總。
export const listSecuritiesIndustrySectors = async (): Promise<SecuritiesIndustrySector[]> => {
  const codes = getIndustryCodes();
  if (!codes) return [];

  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<IndustryCountRow[]>`
      SELECT industry, COUNT(*) as count FROM "export"."company_profile" WHERE industry IS NOT NULL GROUP BY industry
    `,
    tpexExportPrisma.$queryRaw<IndustryCountRow[]>`
      SELECT industry, COUNT(*) as count FROM "export"."company_profile" WHERE industry IS NOT NULL GROUP BY industry
    `,
  ]);

  const counts = new Map<string, number>();
  for (const row of [...twseRows, ...tpexRows]) {
    if (row.industry === null) continue;
    counts.set(row.industry, (counts.get(row.industry) ?? 0) + Number(row.count));
  }

  return Object.entries(codes)
    .filter(([code]) => !NON_INDUSTRY_CODES.has(code))
    .map(([code, name]) => ({ code, name, companyCount: counts.get(code) ?? 0 }))
    .sort((a, b) => a.code.localeCompare(b.code));
};

// screener 用——任一代碼底下所有公司，多個代碼是聯集（OR），不是交集。查無資料的 code
// 自然不會貢獻任何 symbol，不報錯——呼叫端（screener 的 service.ts）自己決定要不要因為
// 「有 code 不合法」讓整個請求 400（見 isValidSecuritiesSectorCode）。
export const listCompaniesBySectorCodes = async (codes: string[]): Promise<Set<string>> => {
  if (codes.length === 0) return new Set();

  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile" WHERE industry = ANY(${codes})`,
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile" WHERE industry = ANY(${codes})`,
  ]);

  return new Set([...twseRows.map((r) => r.symbol), ...tpexRows.map((r) => r.symbol)]);
};
