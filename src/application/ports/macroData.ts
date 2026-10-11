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

// 股權風險溢酬（ERP）計算結果快取（analysis DB 的 macro_equity_risk_premiums）——PK 是
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

// 美國聯邦基金利率目標一次調整事件（gov-ts export.us_policy_rate）。2008-12-16 以前單一目標值、上下限同值。百分比數字。
export interface UsPolicyRateEvent {
  effectiveDate: Date;
  targetUpper: number;
  targetLower: number;
}

// 歐洲央行三大政策利率一次調整事件（gov-ts export.ecb_policy_rate）。百分比數字，可為負。
export interface EcbPolicyRateEvent {
  effectiveDate: Date;
  depositFacilityRate: number | null;
  mainRefinancingRate: number | null;
  marginalLendingRate: number | null;
  mainRefinancingIsMinimumBid: boolean;
}

export interface MacroDataPort {
  // 央行政策利率歷次調整事件，全部歷史依生效日升冪（GET /macro/cbc-policy-rate 要跟前一列相減算幅度）。
  listCbcPolicyRatesAsc(): Promise<CbcPolicyRateEvent[]>;
  // 美國政策利率歷次調整事件，全部歷史依生效日升冪（GET /macro/us-policy-rate）。
  listUsPolicyRatesAsc(): Promise<UsPolicyRateEvent[]>;
  // 歐洲央行政策利率歷次調整事件，全部歷史依生效日升冪（GET /macro/ecb-policy-rate）。
  listEcbPolicyRatesAsc(): Promise<EcbPolicyRateEvent[]>;
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
  m1aYoyPct: number | null;
  m1bAmount: number | null;
  m1bYoyPct: number | null;
  m2Amount: number | null;
  m2YoyPct: number | null;
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
  avgTaiexYoyPct: number | null;
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
  yoyChangePct: number | null;
}

// 2026-09-22 gov-ts 核對主計總處原表後把 yoy_change_percent 整欄移除（它是對「百分點」再算年增率，全部 12 個項目都沒意義）。
export interface GdpQuarter {
  year: number;
  quarter: number;
  contributionPoints: number | null; // category=growth_rate 時就是經濟成長率 %；其餘是對成長率的貢獻百分點，各項加總 = growth_rate
}

// 2026-10-07 gov-ts export.monthly_five_major_bank_rate（CBC EG2BM01en，1987-01 起）：短天期無風險利率，給 bff 算使用者持股的
// Sharpe／Sortino／M²／Jensen α。百分比數字（1.70 = 1.70%），跟 10 年期公債（ERP 用）並存、用途不同。
export interface FiveMajorBankRateMonth {
  year: number;
  month: number;
  depositRate1m: number | null; // 一個月期定存 %
  depositRate1y: number | null; // 一年期定存 %
  baseLendingRate: number | null; // 基準放款利率 %
}

// 2026-10-11 國發會景氣循環基準日期（gov-ts v_business_cycle_reference_dates，web-nuxt 景氣循環頁經業務中台要，使用者核准）。
// 日期是月精度，infrastructure 直接給 'YYYY-MM'。尚未認定的欄位（最新一次循環的高峰、谷底、月數）是 null，不是錯誤。
// supplementedFields 列出 gov-ts 依國發會新聞稿補值的欄位名，值就是下面這幾個 camelCase 欄位名，所以欄位名不能改。
export interface BusinessCycleReferenceCycle {
  cycleNo: number; // 第幾次循環
  troughStart: string | null; // 循環起點（前一次循環的谷底）'YYYY-MM'
  peak: string | null;
  troughEnd: string | null; // 循環終點（本次谷底）
  expansionMonths: number | null;
  contractionMonths: number | null;
  totalMonths: number | null;
  supplementedFields: string[];
  supplementSource: string | null;
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
  listFiveMajorBankRatesAsc(): Promise<FiveMajorBankRateMonth[]>;
  listBusinessCycleReferenceCyclesAsc(): Promise<BusinessCycleReferenceCycle[]>; // 依循環序號由舊到新
}
