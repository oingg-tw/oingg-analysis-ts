// 總經資料 port（GET /macro/*）：gov-ts 的 10 年期公債殖利率月資料、twse-ts 的大盤加權指數日收盤、
// analysis DB 的 ERP 計算結果快取。數字欄位在 repository 內就從 Decimal 轉成 number（application 不知道
// Prisma 的 Decimal），實作在 infrastructure/repositories/macro/macroDataPort.ts。

export interface GovBondYieldMonth {
  year: number;
  month: number;
  yieldRate: number; // 百分比數字，例如 1.62
}

export interface TaiexDailyClose {
  tradeDate: Date;
  close: number | null; // 沒成交的日子是 null
}

// 股權風險溢酬（ERP）計算結果快取（analysis DB 的 macro_equity_risk_premium）——PK 是
// windowStart+windowEnd，同一組窗口重算就覆蓋同一列。
export interface EquityRiskPremiumCacheRow {
  windowStart: string;
  windowEnd: string;
  months: number;
  marketReturnGeometric: number;
  marketReturnArithmetic: number;
  avgRiskFreeRate: number;
  erpGeometric: number;
  erpArithmetic: number;
  warnings: string[];
}

export interface MacroDataPort {
  // 全部歷史，依年月升冪（ERP 要跟 TAIEX 月底收盤對齊重疊區間）。
  listGovBondYields10yAsc(): Promise<GovBondYieldMonth[]>;
  // 最新一筆（GET /macro/gov-bond-yield-10y 只要最新值）。
  getLatestGovBondYield10y(): Promise<GovBondYieldMonth | null>;
  // 全部歷史，依日期升冪（ERP 取每月最後一個收盤價用）。
  listTaiexDailyClosesAsc(): Promise<TaiexDailyClose[]>;
  saveEquityRiskPremiumResult(row: EquityRiskPremiumCacheRow): Promise<void>;
}
