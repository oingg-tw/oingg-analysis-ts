export interface MarketRatiosQuery {
  symbol: string;
  // 選填，格式 YYYY-MM-DD；不給就抓最新一筆。這不是財務季度查詢——PER/PBR 是逐日市場資料，
  // 跟其他指標的 year/season 查詢介面不是同一種時間刻度，刻意不套用那套模板。
  date?: string;
}

export interface MarketRatiosResult {
  symbol: string;
  // 實際套用的交易日——有指定 date 時，是「該日期或之前」最新一筆；沒指定就是整張表最新一筆。
  tradeDate: string | null;

  // 以下三個數值直接來自 oingg-twse 的 daily_valuation 表，本服務沒有自己重算，
  // 也不知道對方 EPS 用的是單季、TTM 還是年度口徑——是外部黑盒數字，
  // 跟本服務自己算的 EPS（src/domainBatch/metrics/profitability/eps/）、BVPS 口徑不保證一致，
  // 兩者不要直接拿來互相驗證或混用。
  peRatio: number | null;
  pbRatio: number | null;
  dividendYieldPct: number | null;

  warnings: string[];
}
