import type { CategoricalFieldDefinition, DateFieldDefinition, NumericFieldDefinition } from '@/domain/market/etfFieldRegistry';

// sitca-ts 的 ETF export view（etf_basic_info / etf_monthly_statement / etf_performance /
// fund_expense_ratio_annual_full_year）port——GET /market/etf-ranking、POST /etf-screener、GET /etf-screener/filters 用。
// 回傳原始列形狀（bigint / Decimal 物件），轉換維持在 use case。screenEtfs 把 SQL 組裝（etfScreenerQuery.ts）+
// 執行藏在 infrastructure 裡，application 只拿到已執行完的列。實作在 infrastructure/repositories/sitca/etfQueries.ts。

export interface RawEtfBasicInfoRow {
  symbol: string;
  fund_name: string | null;
  security_short_name: string | null;
  company_name: string | null;
  category: string | null;
  distribution_class_info: string | null;
  is_actively_managed: boolean | null;
}

export interface RawEtfStatementRow {
  symbol: string;
  fund_tax_id: string | null;
  aum_twd: bigint | null;
  total_holders: bigint | null;
  subscription_amount_twd: bigint | null;
  redemption_amount_twd: bigint | null;
  dca_amount_twd: bigint | null;
  aum_below_statutory_threshold: boolean | null;
}

export interface RawEtfPerformanceRow {
  symbol: string;
  return_3m: number | null;
  return_6m: number | null;
  return_1y: number | null;
  return_2y: number | null;
  return_3y: number | null;
  return_5y: number | null;
  return_ytd: number | null;
  return_10y: number | null;
}

// ---- ETF screener 的查詢輸入（欄位定義來自 domain/market/etfFieldRegistry.ts 的白名單）
export interface EtfNumericFilterCondition {
  kind: 'numeric';
  definition: NumericFieldDefinition;
  min: number | null;
  max: number | null;
  exclude: boolean;
}

export interface EtfCategoricalFilterCondition {
  kind: 'categorical';
  definition: CategoricalFieldDefinition;
  values: string[];
}

// 日期欄位：跟數字欄位同一種 min/max 範圍語意（exclude 邏輯也相同），只是比較值是日期字串（'YYYY-MM-DD'）。
export interface EtfDateFilterCondition {
  kind: 'date';
  definition: DateFieldDefinition;
  min: string | null;
  max: string | null;
  exclude: boolean;
}

export type EtfFilterCondition = EtfNumericFilterCondition | EtfCategoricalFilterCondition | EtfDateFilterCondition;

export interface EtfColumnRef {
  field: string;
  definition: NumericFieldDefinition | CategoricalFieldDefinition | DateFieldDefinition;
}

export interface EtfSortSpec {
  field: string; // "symbol" 或 columns 裡其中一個 field，use case 已驗證過
  order: 'asc' | 'desc';
}

export interface EtfDataPort {
  getLatestEtfYearMonth(): Promise<string | null>;
  listEtfBasicInfo(yearMonth: string): Promise<RawEtfBasicInfoRow[]>;
  listEtfMonthlyStatement(yearMonth: string): Promise<RawEtfStatementRow[]>;
  listEtfStatementThresholdFlags(yearMonth: string): Promise<{ symbol: string; aum_below_statutory_threshold: boolean | null }[]>;
  listEtfStatementTaxIdAndThreshold(yearMonth: string): Promise<{ symbol: string; fund_tax_id: string | null; aum_below_statutory_threshold: boolean | null }[]>;
  listEtfPerformance(yearMonth: string): Promise<RawEtfPerformanceRow[]>;
  listFullYearExpenseRatios(year: number): Promise<{ fund_tax_id: string; total_rate: number | null }[]>;
  listDistinctEtfAssetClasses(): Promise<string[]>;
  listDistinctEtfDistributionFrequencies(): Promise<string[]>;
  // 每列：symbol/fundName/shortName/companyName/category + 每個 column 依 field 名稱的欄位 + total_count。
  screenEtfs(yearMonth: string, filters: EtfFilterCondition[], columns: EtfColumnRef[], page: number, pageSize: number, sort: EtfSortSpec | null): Promise<Record<string, unknown>[]>;
}
