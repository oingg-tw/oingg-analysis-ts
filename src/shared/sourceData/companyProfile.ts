import twsePrisma from '@/adapters/prisma/twseClient';

// 只查公司簡稱，給 src/shared/companyNameMiddleware.ts 用——company_profile 目前只鏡像了
// symbol/name/shortName 三個欄位（見 prisma/twse/schema.prisma 開頭說明）。只覆蓋上市（TWSE）
// 公司，查無資料（含上櫃公司）回傳 null，不拋錯——呼叫端要把這個當作「查不到名稱」的正常情境。
export const getCompanyName = async (companyId: string): Promise<string | null> => {
  const profile = await twsePrisma.companyProfile.findUnique({
    where: { symbol: companyId },
    select: { shortName: true },
  });
  return profile?.shortName ?? null;
};
