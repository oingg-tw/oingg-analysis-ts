import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import type { StockPledgeRatioEntry } from '@/application/ports/marketData';

// 2026-09-10 twse-ts 新建的 export.stock_pledge_ratio view——全市場「董監事及大股東股權
// 質押比例」統計（來源 TWSE t187ap09_L），跟 export.foreign_shareholding 同一套模式
// （symbol/report_date + 一個比例欄位，view 本身已經帶公司名稱，不用像 foreignShareholding
// 那樣另外查 getCompanyNamesForSymbols）。report_date 是 TWSE 出表日期，不定期更新（不是
// 每個交易日、也不綁季度末），呼叫端不能假設固定週期。刻意回傳完整歷史陣列（不是單一最新值）
// ——這是使用者要求「讓使用者能自己核對」下的設計決定：質押比例偏高通常被視為公司治理/財務
// 風險警訊，直接把 TWSE 公告的原始數字序列攤開給前端，比包一層「指標」抽象更利於使用者對照
// 原始公告本身，因此這支刻意不走 pitMetrics 的 metricCode/knowledgeDate 架構（跟
// foreignShareholding/dailyPriceHistory 同一個判斷）。
// entry 型別 2026-09-17 Phase 4 搬到 application/ports/marketData.ts（zod schema 在 http/modules/stocks/types.ts）。
export type { StockPledgeRatioEntry };

interface RawStockPledgeRatioRow {
  report_date: Date;
  pledge_percent: unknown;
}

const toNullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// 依日期新到舊排序，取最近 limit 筆——跟 getForeignShareholdingHistory 同一個慣例。
export const getStockPledgeRatioHistory = async (symbol: string, limit: number): Promise<StockPledgeRatioEntry[]> => {
  const rows = await twseExportPrisma.$queryRaw<RawStockPledgeRatioRow[]>`
    SELECT report_date, pledge_percent
    FROM "export"."stock_pledge_ratio"
    WHERE symbol = ${symbol}
    ORDER BY report_date DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    reportDate: row.report_date.toISOString().slice(0, 10),
    pledgePercent: toNullableNumber(row.pledge_percent),
  }));
};
