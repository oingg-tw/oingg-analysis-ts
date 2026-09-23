import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';

// 逐日型指標（beta / marketRatios）逐一歷史交易日回填時的交易日清單——2026-09-17 Phase 6 從
// scripts/backfillBetaPit.ts、scripts/backfillMarketRatiosPit.ts 搬來（逐字），依日期升冪。

export const listDailyPriceTradeDates = (symbol: string): Promise<{ trade_date: Date }[]> =>
  twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`
    SELECT DISTINCT trade_date FROM "export"."daily_price" WHERE symbol = ${symbol} ORDER BY trade_date ASC
  `;

export const listDailyValuationTradeDates = (symbol: string): Promise<{ trade_date: Date }[]> =>
  twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`
    SELECT DISTINCT trade_date FROM "export"."daily_valuation" WHERE symbol = ${symbol} ORDER BY trade_date ASC
  `;

// 2026-09-23 月頻指標（sus）的母體——有月營收的公司。上市走 twse（必須篩 source，同一張表混了公開發行
// 未上市的證券商）、上櫃走 tpex（那張表的 source 是區分兩份 MOPS 報表、兩種都是正牌上櫃公司，不篩）。
// 兩邊 union 去重，回傳排序後的清單。
export const listSymbolsWithMonthlyRevenue = async (): Promise<{ symbol: string }[]> => {
  const [listed, otc] = await Promise.all([
    twseExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."monthly_revenue" WHERE source = 'MONTHLY_REVENUE'`,
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."monthly_revenue"`,
  ]);
  return [...new Set([...listed, ...otc].map((r) => r.symbol))].sort().map((symbol) => ({ symbol }));
};
