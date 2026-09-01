import twsePrisma from '@/adapters/prisma/twseClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { AttentionStocksQuery, AttentionStocksResult, AttentionStockRow } from './types';

interface RawAttentionHistoryNoteRow {
  symbol: string;
  trade_date: Date;
  criteria: string | null;
}

// 注意股票累計次數異常清單——2026-09-01 應使用者要求新增。twse-ts 已經濾掉權證只留真正上市
// 公司，這裡不用再濾一次。取最近公告的前 limit 筆（依交易日由新到舊），不是固定某一天的資料。
export const listAttentionStocks = async (query: AttentionStocksQuery): Promise<AttentionStocksResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const rows = await twsePrisma.$queryRaw<RawAttentionHistoryNoteRow[]>`
    SELECT symbol, trade_date, criteria
    FROM "export"."attention_history_note"
    ORDER BY trade_date DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) {
    warnings.push('查無注意股票資料。');
  }

  const companyNames = await getCompanyNamesForSymbols(rows.map((row) => row.symbol));
  const items: AttentionStockRow[] = rows.map((row) => ({
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    tradeDate: row.trade_date.toISOString().slice(0, 10),
    criteria: row.criteria,
  }));

  return { limit, items, warnings };
};
