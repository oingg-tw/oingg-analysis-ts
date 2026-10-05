import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { Prisma } from '#generated/twse-export-client';
import { getIndustryCodes } from './industryCodes';
import { LISTED_ONLY } from './companyProfile';

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
// 證交所／櫃買類股代碼（company_profile.industry，兩碼），上市優先、查無回 null。2026-10-02 抽出：原本金融業、軟體雲端業
// 各自複製一份同樣的兩庫查詢，Altman Z″ 改用類股判斷後是第三個用途。
export const getSecuritiesSectorCode = async (symbol: string): Promise<string | null> => {
  const [twseRows, tpexRows] = await Promise.all([
    twseExportPrisma.$queryRaw<{ industry: string | null }[]>`SELECT industry FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1`,
    tpexExportPrisma.$queryRaw<{ industry: string | null }[]>`SELECT industry FROM "export"."company_profile" WHERE symbol = ${symbol} LIMIT 1`,
  ]);
  return twseRows[0]?.industry ?? tpexRows[0]?.industry ?? null;
};

export const isFinancialIndustryCompany = async (symbol: string): Promise<boolean> => (await getSecuritiesSectorCode(symbol)) === '17';

// 2026-09-14 新增：ruleOf40（Brad Feld 提出的「營收成長率+FCF利潤率≥40%」複合指標）原始
// 設計是給軟體/SaaS 這類輕資產、高毛利、經常性收入商業模式評估的，對傳產股（營收成長慢但
// 資本結構完全不同）套用會失去意義，甚至可能誤導。跟 isFinancialIndustryCompany 同一種
// 「模型本身不適用不是資料缺漏」判斷，改用允許清單（不是排除清單）：'30'=資訊服務業、
// '36'=數位雲端，是證交所類股裡跟「軟體/SaaS」概念最接近的兩個分類。
export const isSoftwareOrCloudIndustryCompany = async (symbol: string): Promise<boolean> => {
  const industry = await getSecuritiesSectorCode(symbol);
  return industry === '30' || industry === '36';
};

export interface SecuritiesIndustrySector {
  code: string;
  name: string;
  companyCount: number;
}

// 2026-10-01 母體改成跟 GET /companies 同一份（bff-ts 逐類股比對抓到：型錄 2,594 vs /companies 2,349，差 255；
// 20 其他業 230 vs 113、13 電子工業舊分類 33 vs 0）：原本 twse 側沒過濾 source，把公開發行未上市（COMPANY_PROFILE_PUBLIC，
// 約 305 家，含六碼證券商）也算進來，13 的 33 家全是這種。現在 twse 只取上市（LISTED_ONLY）、tpex 上櫃＋興櫃都算（目錄刻意含興櫃），
// 兩邊同一檔（轉板）只算一次——companyCount 的定義就是「screener 用這個代碼篩得到幾家」，listCompaniesBySectorCodes 也走同一份。
const listSectorMembers = async (codes: string[] | null): Promise<{ symbol: string; industry: string }[]> => {
  const [twseRows, tpexRows] = await Promise.all([
    codes
      ? twseExportPrisma.$queryRaw<{ symbol: string; industry: string }[]>`SELECT symbol, industry FROM "export"."company_profile" WHERE industry = ANY(${codes}) AND ${Prisma.raw(LISTED_ONLY)}`
      : twseExportPrisma.$queryRaw<{ symbol: string; industry: string }[]>`SELECT symbol, industry FROM "export"."company_profile" WHERE industry IS NOT NULL AND ${Prisma.raw(LISTED_ONLY)}`,
    codes
      ? tpexExportPrisma.$queryRaw<{ symbol: string; industry: string }[]>`SELECT symbol, industry FROM "export"."company_profile" WHERE industry = ANY(${codes}) AND in_latest_list`
      : tpexExportPrisma.$queryRaw<{ symbol: string; industry: string }[]>`SELECT symbol, industry FROM "export"."company_profile" WHERE industry IS NOT NULL AND in_latest_list`,
  ]);
  const bySymbol = new Map<string, string>();
  for (const r of [...twseRows, ...tpexRows]) if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, r.industry); // twse 優先，同 /companies
  return [...bySymbol].map(([symbol, industry]) => ({ symbol, industry }));
};

// 給「證券類股瀏覽」用——40 個 twse-ts industry_code 為主體。0 家的代碼（13 舊分類、19 綜合）不列出：篩不出任何東西，
// 列在瀏覽清單只會讓人點進空頁；isValidSecuritiesSectorCode 照舊接受它們（不讓存過的篩選條件變 400）。
export const listSecuritiesIndustrySectors = async (): Promise<SecuritiesIndustrySector[]> => {
  const codes = getIndustryCodes();
  if (!codes) return [];

  const counts = new Map<string, number>();
  for (const m of await listSectorMembers(null)) counts.set(m.industry, (counts.get(m.industry) ?? 0) + 1);

  return Object.entries(codes)
    .filter(([code]) => !NON_INDUSTRY_CODES.has(code))
    .map(([code, name]) => ({ code, name, companyCount: counts.get(code) ?? 0 }))
    .filter((s) => s.companyCount > 0)
    .sort((a, b) => a.code.localeCompare(b.code));
};

// screener 用——任一代碼底下所有公司，多個代碼是聯集（OR），不是交集。查無資料的 code
// 自然不會貢獻任何 symbol，不報錯——呼叫端（screener 的 service.ts）自己決定要不要因為
// 「有 code 不合法」讓整個請求 400（見 isValidSecuritiesSectorCode）。
export const listCompaniesBySectorCodes = async (codes: string[]): Promise<Set<string>> => {
  if (codes.length === 0) return new Set();

  return new Set((await listSectorMembers(codes)).map((m) => m.symbol));
};
