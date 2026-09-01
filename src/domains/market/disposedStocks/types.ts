export interface DisposedStocksQuery {
  limit: number; // 1~50，預設 20
}

export interface DisposedStockRow {
  symbol: string;
  companyName: string | null;
  announceDate: string;
  announcementCount: number | null;
  reason: string | null;
  dispositionPeriod: string | null;
  dispositionMeasures: string | null;
  detail: string | null;
  linkInformation: string | null;
}

export interface DisposedStocksResult {
  limit: number;
  items: DisposedStockRow[];
  warnings: string[];
}
