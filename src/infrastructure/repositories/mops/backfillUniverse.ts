import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// backfill 腳本決定「要跑哪些公司」的母體查詢——2026-09-17 Phase 6 從 scripts/*.ts 各自內嵌的 raw SQL 搬來
// （逐字），回傳原始列形狀（{ symbol }），呼叫端自己 map。scripts 只能透過 src/bootstrap/scripts.ts 拿到這些查詢。

// 某一季有 XBRL 損益表資料的公司——全市場 backfill 的標準母體。2026-09-22 前只算 data_type='2'（合併報表，
// 115Q2 實測 2,058 家），會漏掉 249 家結構上只申報個體報表的公司；現在不限口徑，每家公司用哪個 dataType 由
// ReportAvailabilityPort（export.company_report_availability）決定，不在這裡回傳——這張 view 每季 DISTINCT ON
// '2' 優先，某季的 data_type 不等於這家公司的口徑（有合併報表的公司某季缺列會退成 '1'，不能拿來當鍵）。
export const listSymbolsWithIncomeStatement = (year: string, quarter: string): Promise<{ symbol: string }[]> =>
  mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = ${year} AND quarter = ${quarter}
    ORDER BY symbol
  `;

// 「要跑銀行指標的公司」——buildBankTasks 的三個 label（bankAssetQuality / bankCapitalAdequacy /
// bankIncomeWaterfall）共用這份母體。
//
// 2026-09-24 改成兩張表的聯集。原本只查 bank_capital_adequacy_detail_xbrl（eligible_capital
// 非 null = 受 Basel 資本適足率監理的銀行，實測 9 家），漏掉 **2820 華票**：票券公司有銀行式
// 損益表、但不申報資本適足率，於是整家從來沒跑過任何銀行指標。
//
// 為什麼修在這裡而不是三個呼叫端：backfillAllMetricsLatest / backfillFullHistory / scanMetricGaps
// 三支都各自選母體，改呼叫端會漏掉之後新寫的腳本。修在母體函式，全部自動正確。
// 多納進來的公司不會產生髒資料——資本適足率那兩個 label 對它們是「跳過不寫」（見各自 compute
// 的產業 gating），只有它真的有資料的 label 才會寫。
export const listBankSymbols = (): Promise<{ symbol: string }[]> =>
  mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_capital_adequacy_detail_xbrl" WHERE eligible_capital IS NOT NULL
    UNION
    SELECT DISTINCT symbol FROM "export"."bank_income_statement_detail_xbrl" WHERE net_income_loss_of_interest_quarter IS NOT NULL
    ORDER BY symbol
  `;

export const listBankSymbolsForQuarter = (year: string, quarter: string): Promise<{ symbol: string }[]> =>
  mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_capital_adequacy_detail_xbrl"
    WHERE year = ${year} AND quarter = ${quarter} AND eligible_capital IS NOT NULL
    UNION
    SELECT DISTINCT symbol FROM "export"."bank_income_statement_detail_xbrl"
    WHERE year = ${year} AND quarter = ${quarter} AND net_income_loss_of_interest_quarter IS NOT NULL
    ORDER BY symbol
  `;

// 有銀行損益表明細（利息淨收益）的公司——bankIncomeWaterfall 的母體。
export const listSymbolsWithBankIncomeStatement = (): Promise<{ symbol: string }[]> =>
  mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_income_statement_detail_xbrl"
    WHERE net_income_loss_of_interest_quarter IS NOT NULL
    ORDER BY symbol
  `;
