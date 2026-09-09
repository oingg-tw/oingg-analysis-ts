import { tpexExportPrisma } from '@/adapters/prisma/tpexExportClient';

// 2026-09-09 新增——tpex-ts 開的 export.company_industry_chain，資料源是 TPEx「產業價值鏈
// 資訊平台」(ic.tpex.org.tw)，跟 industryClassification.ts 的財政部稅籍分類是完全不同的
// 分類體系，刻意分開兩個獨立檔案/端點，不合併：
//
// - 財政部稅籍分類：5 層階層（section→subclass），每家公司剛好一組分類，只有 TWSE 上市公司
//   有資料（999 家）。
// - 產業價值鏈：2 層（industry→subChain，47 個一級產業/422 個次分類），一家公司可以對應
//   「多個」次分類（多對多，例如 2308 台達電對到 64 個次分類），但涵蓋全部三個市場層級
//   （上市/上櫃/興櫃，實測 1031+889+351=2271 家公司、6481 筆對應關係）。
//
// 這是快照表，沒有 data_date 概念（跟 export.company_profile 一樣），不用等
// export.ingestion_runs 握手，直接查有沒有資料就好。
//
// 資料不是 TPEx 官方 API，是對 ic.tpex.org.tw 做 HTML scraping 取得（tpex-ts 那邊的
// docs/ic-tpex-industry-value-chain-research.md 有完整研究筆記），所以刻意在回應裡帶一個
// 公開可查證的 dataSource URL（見 VALUE_CHAIN_DATA_SOURCE_URL），不是內部服務/table 名稱。

export const VALUE_CHAIN_DATA_SOURCE_URL = 'https://ic.tpex.org.tw';

export type ValueChainLevel = 'industry' | 'subChain';

interface RawChainRow {
  symbol: string;
  market: string;
  industry_code: string;
  industry_name: string | null;
  sub_chain_code: string;
  sub_chain_name: string | null;
}

export interface ValueChainChildSummary {
  code: string;
  name: string | null;
  companyCount: number;
}

export interface ValueChainCompanyEntry {
  symbol: string;
  market: string;
}

export type ValueChainNodeResult =
  | { found: true; code: string | null; level: ValueChainLevel | null; name: string | null; children: ValueChainChildSummary[]; companies: ValueChainCompanyEntry[] }
  | { found: false; code: string | null; level: null; name: null; children: []; companies: [] };

/**
 * 純瀏覽語意（跟 getIndustryNodeInfo 同一種精神）：不給 code 回傳 47 個一級產業（樹根），
 * code 是 industry_code 回傳底下的次分類，code 是 sub_chain_code 回傳精確對應的公司清單。
 * 因為 sub_chain_code 全域唯一（已驗證不會跨 industry 重複），不用另外指定 level 就能查。
 */
export const getValueChainNode = async (code: string | null): Promise<ValueChainNodeResult> => {
  if (code === null) {
    const rows = await tpexExportPrisma.$queryRaw<{ industry_code: string; industry_name: string | null; company_count: bigint }[]>`
      SELECT industry_code, MAX(industry_name) AS industry_name, COUNT(DISTINCT symbol) AS company_count
      FROM "export"."company_industry_chain"
      GROUP BY industry_code
      ORDER BY industry_code
    `;
    return {
      found: true,
      code: null,
      level: null,
      name: null,
      children: rows.map((r) => ({ code: r.industry_code, name: r.industry_name, companyCount: Number(r.company_count) })),
      companies: [],
    };
  }

  const industryRows = await tpexExportPrisma.$queryRaw<{
    industry_name: string | null;
    sub_chain_code: string;
    sub_chain_name: string | null;
    company_count: bigint;
  }[]>`
    SELECT MAX(industry_name) AS industry_name, sub_chain_code, MAX(sub_chain_name) AS sub_chain_name, COUNT(DISTINCT symbol) AS company_count
    FROM "export"."company_industry_chain"
    WHERE industry_code = ${code}
    GROUP BY sub_chain_code
    ORDER BY sub_chain_code
  `;
  const [firstIndustryRow] = industryRows;
  if (firstIndustryRow) {
    return {
      found: true,
      code,
      level: 'industry',
      name: firstIndustryRow.industry_name,
      children: industryRows.map((r) => ({ code: r.sub_chain_code, name: r.sub_chain_name, companyCount: Number(r.company_count) })),
      companies: [],
    };
  }

  const subChainRows = await tpexExportPrisma.$queryRaw<RawChainRow[]>`
    SELECT symbol, market, industry_code, industry_name, sub_chain_code, sub_chain_name
    FROM "export"."company_industry_chain"
    WHERE sub_chain_code = ${code}
    ORDER BY symbol
  `;
  const [firstSubChainRow] = subChainRows;
  if (firstSubChainRow) {
    return {
      found: true,
      code,
      level: 'subChain',
      name: firstSubChainRow.sub_chain_name,
      children: [],
      companies: subChainRows.map((r) => ({ symbol: r.symbol, market: r.market })),
    };
  }

  return { found: false, code, level: null, name: null, children: [], companies: [] };
};
