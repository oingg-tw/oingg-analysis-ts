import twsePrisma from '@/adapters/prisma/twseClient';
import tpexPrisma from '@/adapters/prisma/tpexClient';

// 只查公司簡稱，給 src/shared/companyNameMiddleware.ts 用——company_profile 目前只鏡像了
// symbol/name/shortName 三個欄位（見 prisma/twse/schema.prisma、prisma/tpex/schema.prisma
// 開頭說明）。上市（TWSE）查無資料再查上櫃（TPEx），兩邊都查無資料才回傳 null，不拋錯——
// 呼叫端要把這個當作「查不到名稱」的正常情境。
export const getCompanyName = async (companyId: string): Promise<string | null> => {
  const twseProfile = await twsePrisma.companyProfile.findUnique({ where: { symbol: companyId }, select: { shortName: true } });
  if (twseProfile) return twseProfile.shortName;

  const tpexProfile = await tpexPrisma.companyProfile.findUnique({ where: { symbol: companyId }, select: { shortName: true } });
  return tpexProfile?.shortName ?? null;
};

// GET /stocks/:symbol/quote 用——判斷這家公司到底存不存在（上市或上櫃任一邊有登記），
// 不存在才回 404；存在但查無股價/估值資料是另一回事（回 200，欄位是 null）。
export const companyExists = async (companyId: string): Promise<boolean> => {
  const [twseHit, tpexHit] = await Promise.all([
    twsePrisma.companyProfile.findUnique({ where: { symbol: companyId }, select: { symbol: true } }),
    tpexPrisma.companyProfile.findUnique({ where: { symbol: companyId }, select: { symbol: true } }),
  ]);
  return twseHit !== null || tpexHit !== null;
};

export interface CompanyNameEntry {
  companyId: string;
  companyName: string | null;
}

// 給 GET /companies 用——2026-09-01 應 bff-ts 要求新增，讓他們可以一次拿全部公司代號/名稱對照表
// 自己快取，之後不管是 screener/ranking 這種多公司陣列結果、還是任何其他形狀的回應，都能自己
// 對照補上公司名稱，不需要 analysis-ts 針對每一種回應形狀各自設計注入邏輯（跟 companyNameMiddleware.ts
// 只處理「回應最上層有單一 companyId」這種形狀是互補的兩條路，不是重複）。涵蓋上市（TWSE）+
// 上櫃（TPEx），見兩邊 company_profile 的覆蓋範圍。
export const listAllCompanyNames = async (): Promise<CompanyNameEntry[]> => {
  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.companyProfile.findMany({ select: { symbol: true, shortName: true } }),
    tpexPrisma.companyProfile.findMany({ select: { symbol: true, shortName: true } }),
  ]);
  return [...twseRows, ...tpexRows].map((row) => ({ companyId: row.symbol, companyName: row.shortName }));
};
