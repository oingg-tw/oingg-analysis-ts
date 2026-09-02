export interface DisposedStocksQuery {
  limit: number; // 1~50，預設 20
}

export interface DisposedStockRow {
  symbol: string;
  companyName: string | null;
  market: 'TWSE' | 'TPEx';
  announceDate: string;
  announcementCount: number | null; // TPEx 版本沒有這個欄位，null
  reason: string | null;
  reasonTimes: number | null; // 從 reason 解析出的次數/連續營業日數，解析不出來（例如可轉債標的證券那種無次數概念的原因）時是 null
  dispositionPeriod: string | null;
  dispositionMeasures: string | null; // TPEx 版本沒有這個欄位，null
  detail: string | null;
  linkInformation: string | null; // TPEx 版本沒有這個欄位，null
  sixDayChangePercent: number | null; // 以 announceDate 為基準日的近6個交易日累積漲跌幅（點對點，見 priceChange.ts），資料不足時是 null
}

export interface DisposedStocksResult {
  limit: number;
  items: DisposedStockRow[];
  warnings: string[];
}
