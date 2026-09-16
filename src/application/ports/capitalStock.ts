// 流通股數 port——每股型指標（EPS/BVPS/每股現金流…）跟市值都靠它。注意單位：paidInShares 是
// 實際股數（不是千股），財報金額是千元，算每股數字時分子要先 ×1000，見
// domain/metrics/shared/numericHelpers.ts 的 toPerShare。實作在
// infrastructure/repositories/mops/capitalStock.ts（capital_stock_history，生效日 <= asOfDate 的最新一筆）。
export interface PaidInSharesAsOf {
  paidInShares: bigint;
  effectiveYear: number; // 西元年
  effectiveMonth: number;
}

export interface PaidInSharesPort {
  getPaidInShares(symbol: string, asOfDate: Date): Promise<PaidInSharesAsOf | null>;
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
