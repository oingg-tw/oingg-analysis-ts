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

// 央行政策利率一次調整事件（gov-ts export.cbc_policy_rate，一列一次生效日）。三率都是百分比數字。
export interface CbcPolicyRateEvent {
  effectiveDate: Date;
  discountRate: number; // 重貼現率——新聞講「升息半碼」的那支基準利率
  collateralAccommodationRate: number; // 擔保放款融通利率
  unsecuredAccommodationRate: number; // 短期融通利率（無擔保）
}

export interface MacroDataPort {
  // 央行政策利率歷次調整事件，全部歷史依生效日升冪（GET /macro/cbc-policy-rate 要跟前一列相減算幅度）。
  listCbcPolicyRatesAsc(): Promise<CbcPolicyRateEvent[]>;
  // 全部歷史，依年月升冪（ERP 要跟 TAIEX 月底收盤對齊重疊區間）。
  listGovBondYields10yAsc(): Promise<GovBondYieldMonth[]>;
  // 最新一筆（GET /macro/gov-bond-yield-10y 只要最新值）。
  getLatestGovBondYield10y(): Promise<GovBondYieldMonth | null>;
  // 全部歷史，依日期升冪（ERP 取每月最後一個收盤價用）。
  listTaiexDailyClosesAsc(): Promise<TaiexDailyClose[]>;
  saveEquityRiskPremiumResult(row: EquityRiskPremiumCacheRow): Promise<void>;
}
