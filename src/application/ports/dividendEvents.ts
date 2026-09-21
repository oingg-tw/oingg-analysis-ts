// 股利分派事件 port（mops-ts 的 dividend_distribution，覆蓋率仍低，見記憶
// reference_mops_dividend_distribution_dataset）——dividendDistributionCount 用它數「一年配幾次」，
// knowledge_date 直接用事件自己的公告日，不走財報公告日那套。事件依除息日由新到舊排序。
// 實作在 infrastructure/repositories/mops/dividendDistribution.ts。
export interface DividendDistributionEvent {
  exDividendDate: Date;
  announcementDate: Date | null;
  rocFiscalYear: number;
}

// 2026-09-19 給 GET /companies/dividend-history（歷年股利表）用的完整分派列——一列＝一次董事會/股東會
// 決議通過的分派案（年配公司一年一列、季配公司一年四列，fiscal_quarter 只有季配才有值），金額單位
// 是「元／股」（mops-ts 的 t108sb27 就是每股數字，不是總金額）。cash/stock 各自拆成盈餘與資本公積
// 兩個來源，呼叫端自己加總；特別股股利（preferred_stock_cash_dividend）不在這裡——這張表是普通股。
// rocFiscalYear 是「股利所屬年度」（民國），不是除息年度。
export interface DividendDistributionRow {
  rocFiscalYear: number;
  fiscalQuarter: number | null;
  cashDividendFromEarnings: number | null;
  cashDividendFromCapitalReserve: number | null;
  stockDividendFromEarnings: number | null;
  stockDividendFromCapitalReserve: number | null;
  exDividendDate: Date | null;
  exRightsDate: Date | null;
  cashDividendPaymentDate: Date | null;
  announcementDate: Date | null;
}

// 2026-09-22 給除權息月曆「過去月份」用：全市場在某段除權息日區間內已實現的分派列（exDate = 除息日與除權日
// 中較早的那個，兩者通常同一天）。companyName 直接帶公告上的公司簡稱，ETF/特別股也有，不用再查 profile。
// parValue 是換算股票股利「元／股 → 股／股」用的面額（twse 預告表的 stock_dividend_ratio 是股／股）。
export interface RealizedExDividendRow extends DividendDistributionRow {
  symbol: string;
  companyName: string | null;
  exDate: Date;
  parValue: number | null;
}

export interface DividendEventsPort {
  getDividendDistributionEvents(symbol: string): Promise<DividendDistributionEvent[]>;
  // 全部歷史分派列（含金額/日期欄位），依所屬年度、季度由舊到新。
  listDividendDistributionRows(symbol: string): Promise<DividendDistributionRow[]>;
  // 全市場、除權息日落在 [startDate, endDate] 的分派列，依 exDate、symbol 升冪。
  listRealizedExDividendRows(startDate: Date, endDate: Date): Promise<RealizedExDividendRow[]>;
}
