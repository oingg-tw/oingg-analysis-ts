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

// ---- 2026-09-22 總經特區（web-nuxt）：gov-ts 六個總經 view 的原始序列，全部由舊到新、數字已轉 number ----
// 月/季座標保留原始 year/month/quarter，`period` 字串（'YYYY-MM' / 'YYYY-Qn'）由 application 組，前端不用各自拼。

export interface BusinessCycleMonth {
  year: number;
  month: number;
  leadingIndexComposite: number | null;
  leadingIndexDetrended: number | null;
  coincidentIndexComposite: number | null;
  coincidentIndexDetrended: number | null;
  laggingIndexComposite: number | null;
  laggingIndexDetrended: number | null;
  signalScore: number | null; // 景氣對策信號綜合分數（9–45）
  signalLight: string | null; // 燈號中文：紅/黃紅/綠/黃藍/藍
}

export interface MonetaryAggregateMonth {
  year: number;
  month: number;
  m1aAmount: number | null; // 日平均餘額，百萬新台幣
  m1aYoyPercent: number | null;
  m1bAmount: number | null;
  m1bYoyPercent: number | null;
  m2Amount: number | null;
  m2YoyPercent: number | null;
}

// 2026-09-22 gov-ts export.monthly_stock_market_summary（CBC EG27M01en，1987-05 起）：web-nuxt 大事件年表頁要把大盤推到
// 1987（35 年回看視窗），avg_taiex 是加權指數**月平均**（證交所編製、1966 年平均=100，跟日收盤是同一套指數的不同取樣）。
export interface StockMarketSummaryMonth {
  year: number;
  month: number;
  listedCompanies: number | null;
  totalParValue: number | null; // 百萬新台幣
  totalMarketValue: number | null;
  totalTradingValue: number | null;
  avgDailyTradingValue: number | null; // 1987–88 為 null
  avgTaiex: number | null; // 加權指數月平均
  avgTaiexYoyPercent: number | null;
}

export interface UsdTwdRateDay {
  tradeDate: Date;
  bankBuyingRate: number | null; // 元/美元
  bankSellingRate: number | null;
  interbankClosingRate: number | null;
}

export interface CpiMonth {
  year: number;
  month: number;
  indexValue: number | null;
  yoyChangePercent: number | null;
}

// 2026-09-22 gov-ts 核對主計總處原表後把 yoy_change_percent 整欄移除（它是對「百分點」再算年增率，全部 12 個項目都沒意義）。
export interface GdpQuarter {
  year: number;
  quarter: number;
  contributionPoints: number | null; // category=growth_rate 時就是經濟成長率 %；其餘是對成長率的貢獻百分點，各項加總 = growth_rate
}

export type UsdTwdInterval = 'daily' | 'weekly' | 'monthly';

export interface MacroSeriesPort {
  listBusinessCycleIndicatorsAsc(): Promise<BusinessCycleMonth[]>;
  listMonetaryAggregatesAsc(): Promise<MonetaryAggregateMonth[]>;
  listStockMarketSummariesAsc(): Promise<StockMarketSummaryMonth[]>;
  // 由新到舊取 limit 筆；weekly/monthly 是每區間最後一個有資料的日子（跟 TaiexIndexPort 同一種語意）。
  listLatestUsdTwdRates(limit: number, interval: UsdTwdInterval): Promise<UsdTwdRateDay[]>;
  listCpiAsc(category: string): Promise<CpiMonth[]>;
  listGdpAsc(category: string): Promise<GdpQuarter[]>;
}
