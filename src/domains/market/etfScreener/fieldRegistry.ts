// ETF screener 可篩選/排序/顯示的欄位白名單——不像股票 screener 有 40+ 張各自獨立的 curated
// 表需要動態解析（那邊才需要 metricTableRegistry 那種通用機制），ETF 資料就是 etf_basic_info/
// etf_monthly_statement/etf_performance 三張表（用 security_code+year_month 對齊）合併成一份
// base 查詢，欄位固定已知，直接手動列出白名單即可，見 queryBuilder.ts 的 base CTE。
//
// market/assetClass/isActive 是 sitca-ts 的 category 字串（例如「上市ETF_國外成分證券ETF」）
// 現場用 SQL 表達式拆出來的，不是獨立欄位、也不是另外 sync 一張表維護——2026-09-02 應使用者
// 要求，這些類別欄位要能像數字欄位一樣走真正的 SQL WHERE，不能只是抓回來後在 JS 裡篩選。

export type EtfFieldKind = 'numeric' | 'categorical';

export interface NumericFieldDefinition {
  kind: 'numeric';
  field: string;
  label: string;
  sqlColumn: string; // base（或 expense）查詢裡的欄位別名
  needsExpenseJoin?: boolean;
}

export interface CategoricalFieldDefinition {
  kind: 'categorical';
  field: string;
  label: string;
  sqlColumn: string;
  staticValues?: string[]; // 選項固定已知的（market/isActive）；沒給的話（assetClass）呼叫端要現查 distinct 值
}

export type EtfFieldDefinition = NumericFieldDefinition | CategoricalFieldDefinition;

export const NUMERIC_FIELDS: Record<string, NumericFieldDefinition> = {
  aum: { kind: 'numeric', field: 'aum', label: '規模（新台幣）', sqlColumn: 'aum' },
  holders: { kind: 'numeric', field: 'holders', label: '受益人數', sqlColumn: 'holders' },
  netFlow: { kind: 'numeric', field: 'netFlow', label: '淨申購（申購-贖回）', sqlColumn: 'net_flow' },
  dcaAmount: { kind: 'numeric', field: 'dcaAmount', label: '定期定額金額', sqlColumn: 'dca_amount' },
  marketShareRate: { kind: 'numeric', field: 'marketShareRate', label: '市占率', sqlColumn: 'market_share_rate' },
  nav: { kind: 'numeric', field: 'nav', label: '淨值', sqlColumn: 'nav' },
  return3m: { kind: 'numeric', field: 'return3m', label: '近3月報酬率', sqlColumn: 'return_3m' },
  return6m: { kind: 'numeric', field: 'return6m', label: '近6月報酬率', sqlColumn: 'return_6m' },
  return1y: { kind: 'numeric', field: 'return1y', label: '近1年報酬率', sqlColumn: 'return_1y' },
  return2y: { kind: 'numeric', field: 'return2y', label: '近2年報酬率', sqlColumn: 'return_2y' },
  return3y: { kind: 'numeric', field: 'return3y', label: '近3年報酬率', sqlColumn: 'return_3y' },
  return5y: { kind: 'numeric', field: 'return5y', label: '近5年報酬率', sqlColumn: 'return_5y' },
  returnYtd: { kind: 'numeric', field: 'returnYtd', label: '今年以來報酬率', sqlColumn: 'return_ytd' },
  return10y: { kind: 'numeric', field: 'return10y', label: '近10年報酬率', sqlColumn: 'return_10y' },
  // 只用「最新一個完整年度」，發行日在那個基準年（或更晚）的 ETF 沒有完整年度可比，值是
  // null——跟 etfRanking 的 expenseRatio 同一套規則，見 queryBuilder.ts 的說明。
  expenseRatio: { kind: 'numeric', field: 'expenseRatio', label: '總費用率', sqlColumn: 'expense_ratio', needsExpenseJoin: true },
};

export const CATEGORICAL_FIELDS: Record<string, CategoricalFieldDefinition> = {
  market: { kind: 'categorical', field: 'market', label: '市場別', sqlColumn: 'market', staticValues: ['TWSE', 'TPEx'] },
  // assetClass 的選項不寫死——之後 sitca-ts 分類異動（例如新增一種成分類型）會直接反映在
  // GET /etf-screener/filters，不用改程式碼，見 service.ts 的 getFilterCatalog。
  assetClass: { kind: 'categorical', field: 'assetClass', label: '資產類型', sqlColumn: 'asset_class' },
  isActive: { kind: 'categorical', field: 'isActive', label: '主動式ETF', sqlColumn: 'is_active', staticValues: ['true', 'false'] },
};

export const ALL_FIELDS: Record<string, EtfFieldDefinition> = { ...NUMERIC_FIELDS, ...CATEGORICAL_FIELDS };

export const resolveEtfField = (field: string): EtfFieldDefinition | null => ALL_FIELDS[field] ?? null;
