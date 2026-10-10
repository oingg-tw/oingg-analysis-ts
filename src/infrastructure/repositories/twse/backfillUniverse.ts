import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';

// 逐日型指標（beta / marketRatios）逐一歷史交易日回填時的交易日清單——2026-09-17 Phase 6 從
// scripts/backfillBetaPit.ts、scripts/backfillMarketRatiosPit.ts 搬來（逐字），依日期升冪。

export const listDailyPriceTradeDates = (symbol: string): Promise<{ trade_date: Date }[]> =>
  twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`
    SELECT DISTINCT trade_date FROM "export"."v_daily_prices" WHERE symbol = ${symbol} ORDER BY trade_date ASC
  `;

export const listDailyValuationTradeDates = (symbol: string): Promise<{ trade_date: Date }[]> =>
  twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`
    SELECT DISTINCT trade_date FROM "export"."v_daily_valuations" WHERE symbol = ${symbol} ORDER BY trade_date ASC
  `;

// 2026-09-23 月頻指標（sus）的母體——有月營收的公司。上市走 twse（必須篩 source，同一張表混了公開發行
// 未上市的證券商）、上櫃走 tpex（那張表的 source 是區分兩份 MOPS 報表、兩種都是正牌上櫃公司，不篩）。
// 兩邊 union 去重，回傳排序後的清單。
export const listSymbolsWithMonthlyRevenue = async (): Promise<{ symbol: string }[]> => {
  // 2026-10-10 加上 mops market_monthly_revenue：交易所月營收缺 124 家（多為 -KY），讀取端已用 mops 補（見 twse/monthlyRevenue.ts），
  // 回填母體也要涵蓋，否則這些公司的月頻指標永遠不會被算。
  const [listed, otc, mops] = await Promise.all([
    twseExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."v_monthly_revenues" WHERE source = 'MONTHLY_REVENUE'`,
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."v_monthly_revenues"`,
    mopsExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."market_monthly_revenue"`,
  ]);
  return [...new Set([...listed, ...otc, ...mops].map((r) => r.symbol))].sort().map((symbol) => ({ symbol }));
};
