import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 股權風險溢酬（ERP）計算結果快取（analysis DB 的 macro_equity_risk_premium）——PK 是
// windowStart+windowEnd，同一組窗口重算就覆蓋同一列。2026-09-17 重構 Phase 2 從
// application/macro/equityRiskPremium/service.ts 搬來。
export interface EquityRiskPremiumCacheRow {
  windowStart: string;
  windowEnd: string;
  months: number;
  marketReturnGeometric: number;
  marketReturnArithmetic: number;
  avgRiskFreeRate: number;
  erpGeometric: number;
  erpArithmetic: number;
  warnings: string[];
}

export const upsertEquityRiskPremiumResult = async (row: EquityRiskPremiumCacheRow): Promise<void> => {
  const { windowStart, windowEnd, ...values } = row;
  await analysisPrisma.equityRiskPremiumResult.upsert({
    where: { windowStart_windowEnd: { windowStart, windowEnd } },
    create: { windowStart, windowEnd, ...values },
    update: values,
  });
};
