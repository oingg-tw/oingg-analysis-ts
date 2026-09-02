export interface EtfNumericFilterInput {
  field: string;
  min: number | null;
  max: number | null;
  exclude?: boolean;
}

export interface EtfCategoricalFilterInput {
  field: string;
  values: string[];
}

export type EtfFilterInput = EtfNumericFilterInput | EtfCategoricalFilterInput;

export interface EtfColumnInput {
  field: string;
}

export interface EtfScreenerRequest {
  filters: EtfFilterInput[];
  columns: EtfColumnInput[];
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface EtfScreenerRow {
  symbol: string;
  fundName: string | null;
  shortName: string | null;
  companyName: string | null; // 發行的投信公司
  category: string | null; // 原始分類字串
  values: Record<string, number | string | boolean | null>;
}

export interface EtfScreenerResponse {
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  results: EtfScreenerRow[];
}

export interface EtfFilterFieldCatalogEntry {
  field: string;
  label: string;
  kind: 'numeric' | 'categorical';
  values?: string[]; // 只有 categorical 欄位才有
}

export interface EtfFilterCatalogResponse {
  fields: EtfFilterFieldCatalogEntry[];
}
