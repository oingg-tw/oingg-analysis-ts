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
