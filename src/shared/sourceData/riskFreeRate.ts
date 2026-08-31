import govPrisma from '@/adapters/prisma/govClient';

export interface RiskFreeRateAsOf {
  ratePct: number; // 10年期政府公債次級市場殖利率，單位是百分比（例如 1.77 代表 1.77%）
  year: number;
  month: number;
}

// CAPM 無風險利率代理：10年期政府公債次級市場殖利率（月資料），來源見 prisma/gov/schema.prisma
// 的 MonthlyGovBondYield10y 註解。asOfDate 當月尚未發布時（通常落後 1-2 個月），
// 自動退回到 asOfDate 或之前最近一個「已經有資料」的月份。
export const getRiskFreeRateAsOf = async (asOfDate: Date): Promise<RiskFreeRateAsOf | null> => {
  const year = asOfDate.getUTCFullYear();
  const month = asOfDate.getUTCMonth() + 1;

  const row = await govPrisma.monthlyGovBondYield10y.findFirst({
    where: { OR: [{ year: { lt: year } }, { year, month: { lte: month } }] },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  if (!row) return null;

  return {
    ratePct: Number(row.yieldRate),
    year: row.year,
    month: row.month,
  };
};
