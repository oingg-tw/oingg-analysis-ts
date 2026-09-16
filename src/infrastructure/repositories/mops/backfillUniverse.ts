import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// backfill 腳本決定「要跑哪些公司」的母體查詢——2026-09-17 Phase 6 從 scripts/*.ts 各自內嵌的 raw SQL 搬來
// （逐字），回傳原始列形狀（{ symbol }），呼叫端自己 map。scripts 只能透過 src/bootstrap/scripts.ts 拿到這些查詢。

// 某一季 dataType='2'（合併報表）有 XBRL 損益表資料的公司——全市場 backfill 的標準母體（115Q2 實測 2,058 家）。
export const listSymbolsWithIncomeStatement = (year: string, quarter: string): Promise<{ symbol: string }[]> =>
  mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = ${year} AND quarter = ${quarter} AND data_type = '2'
    ORDER BY symbol
  `;

// 真正的銀行：bank_capital_adequacy_detail_xbrl 每家公司都有列，但只有銀行的 eligible_capital 不是 null
// （mops-ts 2026-09-11 澄清），實測 11 家。
export const listBankSymbols = (): Promise<{ symbol: string }[]> =>
  mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_capital_adequacy_detail_xbrl" WHERE eligible_capital IS NOT NULL ORDER BY symbol
  `;

export const listBankSymbolsForQuarter = (year: string, quarter: string): Promise<{ symbol: string }[]> =>
  mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_capital_adequacy_detail_xbrl"
    WHERE year = ${year} AND quarter = ${quarter} AND eligible_capital IS NOT NULL
    ORDER BY symbol
  `;

// 有銀行損益表明細（利息淨收益）的公司——bankIncomeWaterfall 的母體。
export const listSymbolsWithBankIncomeStatement = (): Promise<{ symbol: string }[]> =>
  mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_income_statement_detail_xbrl"
    WHERE net_income_loss_of_interest_quarter IS NOT NULL
    ORDER BY symbol
  `;
