import { govExportPrisma } from '@/infrastructure/prisma/govExportClient';

// gov-ts 的 10 年期公債殖利率月資料（export.monthly_gov_bond_yield_10y，來源是央行統計資料庫
// EG43M01en）——2026-09-17 重構 Phase 2 從 application/macro/* 搬來的 raw SQL（逐字），
// yield_rate 是 Decimal 物件，轉換維持在呼叫端。
export interface RawGovBondYieldRow {
  year: number;
  month: number;
  yield_rate: unknown;
}

// 全部歷史，依年月升冪（equityRiskPremium 要跟 TAIEX 月底收盤對齊重疊區間）。
export const listAllGovBondYields10yAsc = (): Promise<RawGovBondYieldRow[]> =>
  govExportPrisma.$queryRaw<RawGovBondYieldRow[]>`
    SELECT year, month, yield_rate FROM "export"."monthly_gov_bond_yield_10y" ORDER BY year ASC, month ASC
  `;

// 最新一筆（GET /macro/gov-bond-yield-10y 只要最新值）。
export const getLatestGovBondYield10yRow = async (): Promise<RawGovBondYieldRow | null> => {
  const rows = await govExportPrisma.$queryRaw<RawGovBondYieldRow[]>`
    SELECT year, month, yield_rate FROM "export"."monthly_gov_bond_yield_10y"
    ORDER BY year DESC, month DESC LIMIT 1
  `;
  return rows[0] ?? null;
};
