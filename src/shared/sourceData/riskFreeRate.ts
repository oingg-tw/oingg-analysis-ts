import { govExportPrisma } from '@/adapters/prisma/govExportClient';

export interface RiskFreeRateAsOf {
  ratePct: number; // 10年期政府公債次級市場殖利率，單位是百分比（例如 1.77 代表 1.77%）
  year: number;
  month: number;
}

interface RawGovBondYieldRow {
  year: number;
  month: number;
  yield_rate: unknown;
}

// CAPM 無風險利率代理：10年期政府公債次級市場殖利率（月資料）——2026-09-03 使用者決定 curated
// 中台層現階段太早，改回直接查 govExportPrisma（etl_reader，export.monthly_gov_bond_yield_10y
// 這張 view 沒有唯一識別欄位，走 $queryRaw）。asOfDate 當月尚未發布時（通常落後 1-2 個月），
// 自動退回到 asOfDate 或之前最近一個「已經有資料」的月份。
export const getRiskFreeRateAsOf = async (asOfDate: Date): Promise<RiskFreeRateAsOf | null> => {
  const year = asOfDate.getUTCFullYear();
  const month = asOfDate.getUTCMonth() + 1;

  const rows = await govExportPrisma.$queryRaw<RawGovBondYieldRow[]>`
    SELECT year, month, yield_rate FROM "export"."monthly_gov_bond_yield_10y"
    WHERE year < ${year} OR (year = ${year} AND month <= ${month})
    ORDER BY year DESC, month DESC LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  return {
    ratePct: Number(row.yield_rate),
    year: row.year,
    month: row.month,
  };
};
