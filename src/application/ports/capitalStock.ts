// 流通在外普通股 port——每股型指標（EPS/BVPS/每股現金流…）跟市值都靠它。2026-09-25 起回傳的是 IAS 33 的
// 「流通在外普通股」＝已發行 − 特別股 − 庫藏股（見 domain/financials/outstandingCommonShares.ts），不再是
// capital_stock_history 的實收股數（那個含特別股與庫藏股）；名稱同日從 paidInShares 改成 outstandingCommonShares。
// 注意單位：是實際股數（不是千股），財報金額是千元，算每股數字時分子要先 ×1000，見 numericHelpers.ts 的 toPerShare。
// 有特別股卻查不到特別股股本的公司回 null（分母定義待補）。實作在 infrastructure/repositories/mops/capitalStock.ts。
export interface OutstandingCommonSharesAsOf {
  outstandingCommonShares: bigint;
  issuedShares: bigint; // capital_stock_history 實收股數（含特別股、庫藏股），來源追溯用
  preferredShares: bigint;
  treasuryShares: bigint;
  // 分子端也要只算普通股（方案 1 第二段）：每股淨值類從權益扣特別股股本、EPS 類從淨利扣特別股股利。
  // 兩者跟特別股股數同一次查詢、同一個「asOf 前最近一季」，所以一起帶回來，各指標不用另外接資料來源。
  preferredCapitalThousands: bigint; // 特別股股本（千元），沒有特別股為 0
  preferredDividendsTtmThousands: bigint; // 近四季特別股股利（權益變動表宣告數，千元），沒有特別股為 0
  effectiveYear: number; // 已發行股數那筆股本異動的生效年（西元）
  effectiveMonth: number;
}

export interface OutstandingCommonSharesPort {
  getOutstandingCommonShares(symbol: string, asOfDate: Date): Promise<OutstandingCommonSharesAsOf | null>;
  // 2026-09-27：from 之後、to 以前生效的面額變更累積股數倍數（前期每股 ÷ 倍數、前期股數 × 倍數 = 換算到 to 的股數基準）。
  // 跨期比較每股數字的指標（成長率、CAGR、股本變化率…）要用它，否則股票分割會被當成每股價值的變化。
  getShareSplitFactor(symbol: string, fromDate: Date, toDate: Date): Promise<number>;
}

// ---- 股本異動歷史（GET /companies/capital-stock-history）——跟上面的 PaidInSharesPort 刻意分開兩個 port：
// 指標核心的 PitDeps 只要 getPaidInShares，tests/fakes/pit 的記憶體版不用實作用不到的歷史查詢。
// 五種結構化的股本變動原因，bigint 序列化成字串——2026-09-04 應 web-nuxt 要求新增，實測過
// capital_stock_history 沒有庫藏股/可轉債轉換的獨立欄位，這兩種變動反而是寫在 remarks
// 自由格式文字裡（例如「註銷庫藏股3,249,000股」），不是結構化數字欄位。
export interface CapitalStockChangeSource {
  cashIncrease: string | null;
  capitalReserveTransfer: string | null;
  retainedEarningsTransfer: string | null;
  mergerIncrease: string | null;
  capitalReduction: string | null;
  other: string | null; // 自由格式文字，不是這五種結構化原因之一時才會有值
}

export interface CapitalStockHistoryEntry {
  effectiveDate: string; // "YYYY-MM"，異動事件序列，同一年可能 0 筆或多筆
  paidInShares: string; // 實際流通股數（不是千股），bigint 序列化成字串
  paidInCapital: string | null; // 實收資本額（元）
  sharesChangePercent: number | null; // 跟時間序列上更早的前一筆相比的變動百分比，最早一筆是 null
  changeSource: CapitalStockChangeSource;
  remarks: string | null;
}

export interface CapitalStockHistoryPort {
  // 全部歷史事件，由新到舊排序；查無資料（或表不存在）回空陣列。
  getCapitalStockHistory(symbol: string): Promise<CapitalStockHistoryEntry[]>;
}
