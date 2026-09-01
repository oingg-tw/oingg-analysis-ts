import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

interface RawTpexCompanyProfileRow {
  symbol: string;
  short_name: string | null;
}

// 只查公司簡稱，給 src/shared/companyNameMiddleware.ts 用——company_profile 目前只鏡像了
// symbol/name/shortName 幾個欄位（見 prisma/twse/schema.prisma、prisma/tpexExport/schema.prisma
// 開頭說明）。上市（TWSE）查無資料再查上櫃（TPEx），兩邊都查無資料才回傳 null，不拋錯——
// 呼叫端要把這個當作「查不到名稱」的正常情境。
//
// TPEx 這邊 2026-09-01 改走 export.company_profile（tpexExportPrisma，$queryRaw——這張 view
// 沒有唯一識別欄位，Prisma Client 不會產生 model 存取子），取代原本讀 tpex-ts dev 環境的舊帳號。
export const getCompanyName = async (companyId: string): Promise<string | null> => {
  const twseProfile = await twsePrisma.companyProfile.findUnique({ where: { symbol: companyId }, select: { shortName: true } });
  if (twseProfile) return twseProfile.shortName;

  const tpexRows = await tpexExportPrisma.$queryRaw<RawTpexCompanyProfileRow[]>`
    SELECT symbol, short_name FROM "export"."company_profile" WHERE symbol = ${companyId} LIMIT 1
  `;
  return tpexRows[0]?.short_name ?? null;
};

// GET /stocks/:symbol/quote 用——判斷這家公司到底存不存在（上市或上櫃任一邊有登記），
// 不存在才回 404；存在但查無股價/估值資料是另一回事（回 200，欄位是 null）。
export const companyExists = async (companyId: string): Promise<boolean> => {
  const [twseHit, tpexRows] = await Promise.all([
    twsePrisma.companyProfile.findUnique({ where: { symbol: companyId }, select: { symbol: true } }),
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile" WHERE symbol = ${companyId} LIMIT 1`,
  ]);
  return twseHit !== null || tpexRows.length > 0;
};

// 給「排除 ETF/衍生性商品，只留真正的上市公司」用（2026-09-01 應使用者要求新增——排行榜這類
// 主打/推薦性質的功能，不該把 00852L 這種槓桿/反向 ETF 跟真正的公司股票混在一起排）。
// company_profile 只會有真正登記的公司（symbol/name/tax_id 等公司基本資料），ETF/權證/
// 衍生商品不會出現在裡面——用這個當「是不是真正的公司」的判斷依據，比自己猜代號規則
// （00 開頭、L/R 結尾）可靠，那些規則可能有例外。只給 TWSE（上市）用，這幾個排行功能
// （foreign_holding、margin_balance）本身也只有上市資料，不含上櫃。
export const getTwseCompanySymbolSet = async (): Promise<Set<string>> => {
  const rows = await twsePrisma.companyProfile.findMany({ select: { symbol: true } });
  return new Set(rows.map((row) => row.symbol));
};

export interface CompanyNameEntry {
  companyId: string;
  companyName: string | null;
}

// 給 GET /companies 用——2026-09-01 應 bff-ts 要求新增，讓他們可以拿全部公司代號/名稱對照表
// 自己快取，之後不管是 screener/ranking 這種多公司陣列結果、還是任何其他形狀的回應，都能自己
// 對照補上公司名稱，不需要 analysis-ts 針對每一種回應形狀各自設計注入邏輯（跟 companyNameMiddleware.ts
// 只處理「回應最上層有單一 companyId」這種形狀是互補的兩條路，不是重複）。涵蓋上市（TWSE）+
// 上櫃（TPEx），見兩邊 company_profile 的覆蓋範圍。
//
// 兩邊資料庫各自查全量、在應用層合併後才切頁——不是不能做到跨資料庫的 offset/limit 精確查詢，
// 是這個資料量級（總共 ~2,500 筆，每筆只有兩個字串欄位）做這件事的複雜度完全不划算，真正要
// 避免的浪費是「回應酬載」不是「資料庫查詢量」。
//
// 少數股票代號兩邊資料庫都有登記（bff-ts 2026-09-01 實測抓到 7914/7932 這兩檔），資料內容
// 一樣、只是新舊資料尚未收斂——依 symbol 去重，兩邊都有時保留 TWSE 那筆（跟 getCompanyName/
// companyExists 一律先查 TWSE 再查 TPEx 同一個優先順序），不能讓同一個 companyId 出現兩次，
// 之前沒去重害 bff-ts 那邊 upsert 撞到「ON CONFLICT DO UPDATE 同一列被影響兩次」的錯誤。
const dedupeBySymbol = (rows: { symbol: string; shortName: string | null }[]): CompanyNameEntry[] => {
  const bySymbol = new Map<string, string | null>();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row.shortName);
  }
  return [...bySymbol].map(([companyId, companyName]) => ({ companyId, companyName }));
};

export const listAllCompanyNames = async (limit: number, offset: number): Promise<{ count: number; entries: CompanyNameEntry[] }> => {
  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.companyProfile.findMany({ select: { symbol: true, shortName: true } }),
    tpexExportPrisma.$queryRaw<RawTpexCompanyProfileRow[]>`SELECT symbol, short_name FROM "export"."company_profile"`,
  ]);
  const all = dedupeBySymbol([...twseRows, ...tpexRows.map((r) => ({ symbol: r.symbol, shortName: r.short_name }))]); // twseRows 排在前面，去重時優先保留
  return { count: all.length, entries: all.slice(offset, offset + limit) };
};

export const countAllCompanyNames = async (): Promise<number> => {
  const [twseSymbols, tpexRows] = await Promise.all([
    twsePrisma.companyProfile.findMany({ select: { symbol: true } }),
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT symbol FROM "export"."company_profile"`,
  ]);
  return new Set([...twseSymbols.map((r) => r.symbol), ...tpexRows.map((r) => r.symbol)]).size;
};
