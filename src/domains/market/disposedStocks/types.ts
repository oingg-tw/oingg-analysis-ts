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
  reasonShort: string | null; // 從 reason 解析出的中文短標籤（例如「漲跌異常」「當沖比率異常」「轉(交)換公司債」），解析不出來時是 null
  dispositionPeriod: string | null; // 原始字串，例如「115/08/27～115/09/02」或「1150827~1150902」
  dispositionStartDate: string | null; // 從 dispositionPeriod 拆出的西元開始日期，解析不出來時是 null
  dispositionEndDate: string | null; // 從 dispositionPeriod 拆出的西元結束日期，解析不出來時是 null
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
