import type { AttentionCriteriaDetail } from './parseCriteria';

export type { AttentionCriteriaDetail };

export interface AttentionStocksQuery {
  limit: number; // 1~50，預設 20
}

export interface AttentionStockRow {
  symbol: string;
  companyName: string | null;
  market: 'TWSE' | 'TPEx';
  tradeDate: string;
  criteria: string | null; // 原始中文說明，可能包含多個原因子句直接串接
  criteriaDetails: AttentionCriteriaDetail[]; // 從 criteria 解析出的結構化資料，解析失敗時是空陣列
  sixDayChangePercent: number | null; // 以 tradeDate 為基準日的近6個交易日累積漲跌幅（點對點，見 priceChange.ts），資料不足時是 null
}

export interface AttentionStocksResult {
  limit: number;
  items: AttentionStockRow[];
  warnings: string[];
}
