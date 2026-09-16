// 股利分派事件 port（mops-ts 的 dividend_distribution，覆蓋率仍低，見記憶
// reference_mops_dividend_distribution_dataset）——dividendDistributionCount 用它數「一年配幾次」，
// knowledge_date 直接用事件自己的公告日，不走財報公告日那套。事件依除息日由新到舊排序。
// 實作在 infrastructure/repositories/mops/dividendDistribution.ts。
export interface DividendDistributionEvent {
  exDividendDate: Date;
  announcementDate: Date | null;
  rocFiscalYear: number;
}

export interface DividendEventsPort {
  getDividendDistributionEvents(symbol: string): Promise<DividendDistributionEvent[]>;
}
