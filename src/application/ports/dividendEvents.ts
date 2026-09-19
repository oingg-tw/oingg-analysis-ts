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

export interface DividendEventsPort {
  getDividendDistributionEvents(symbol: string): Promise<DividendDistributionEvent[]>;
  // 全部歷史分派列（含金額/日期欄位），依所屬年度、季度由舊到新。
  listDividendDistributionRows(symbol: string): Promise<DividendDistributionRow[]>;
}
