import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import { parseAttentionCriteria } from './parseCriteria';
import type { AttentionStocksQuery, AttentionStocksResult, AttentionStockRow } from './types';

interface RawAttentionHistoryNoteRow {
  symbol: string;
  trade_date: Date;
  criteria: string | null;
}

interface PoolRow extends RawAttentionHistoryNoteRow {
  market: 'TWSE' | 'TPEx';
}

// 注意股票累計次數異常清單——2026-09-01 應使用者要求新增，之後又應要求合併上市（twse-ts）+
// 上櫃（tpex-ts），兩邊欄位定義完全一致。都已經濾掉權證只留真正公司，這裡不用再濾一次。
// 各自先取前 limit 筆（已經依交易日排序好），合併候選池後再重排取前 limit 筆，邏輯跟
// disposedStocks 一樣。
export const listAttentionStocks = async (query: AttentionStocksQuery): Promise<AttentionStocksResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.$queryRaw<RawAttentionHistoryNoteRow[]>`
      SELECT symbol, trade_date, criteria
      FROM "export"."attention_history_note"
      ORDER BY trade_date DESC
      LIMIT ${limit}
    `,
    tpexExportPrisma.$queryRaw<RawAttentionHistoryNoteRow[]>`
      SELECT symbol, trade_date, criteria
      FROM "export"."attention_history_note"
      ORDER BY trade_date DESC
      LIMIT ${limit}
    `,
  ]);

  const pool: PoolRow[] = [
    ...twseRows.map((row): PoolRow => ({ market: 'TWSE', ...row })),
    ...tpexRows.map((row): PoolRow => ({ market: 'TPEx', ...row })),
  ];

  const sorted = [...pool].sort((a, b) => b.trade_date.getTime() - a.trade_date.getTime()).slice(0, limit);

  if (sorted.length === 0) {
    warnings.push('查無注意股票資料。');
  }

  const companyNames = await getCompanyNamesForSymbols(sorted.map((row) => row.symbol));
  const items: AttentionStockRow[] = sorted.map((row) => ({
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    market: row.market,
    tradeDate: row.trade_date.toISOString().slice(0, 10),
    criteria: row.criteria,
    criteriaDetails: parseAttentionCriteria(row.criteria),
  }));

  return { limit, items, warnings };
};
