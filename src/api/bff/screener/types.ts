export interface ScreenerFilterInput {
  field: string; // "metricCode.basis"，例如 "roe.TTM"
  min: number | null;
  max: number | null;
  exclude?: boolean;
}

export interface ScreenerColumnInput {
  field: string;
}

export interface ScreenerValue {
  value: number | null;
  asOfDate: string | null; // knowledgeDate（YYYY-MM-DD），value 為 null 時也是 null
}

export interface ScreenerRow {
  symbol: string;
  companyName: string | null;
  values: Record<string, ScreenerValue>;
}

export interface ScreenerResponse {
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  results: ScreenerRow[];
}

export interface ScreenerRankingResponse {
  results: ScreenerRow[];
}
