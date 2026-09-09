// ETF screener 可篩選/排序/顯示的欄位白名單——不像股票 screener 有 40+ 張各自獨立的 curated
// 表需要動態解析（那邊才需要 metricTableRegistry 那種通用機制），ETF 資料就是 etf_basic_info/
// etf_monthly_statement/etf_performance 三張表（用 symbol+year_month 對齊）合併成一份
// base 查詢，欄位固定已知，直接手動列出白名單即可，見 queryBuilder.ts 的 base CTE。
//
// market/assetClass 是 sitca-ts 的 category 字串（例如「上市ETF_國外成分證券ETF」）現場用
// SQL 表達式拆出來的，不是獨立欄位、也不是另外 sync 一張表維護——2026-09-02 應使用者要求，
// 這些類別欄位要能像數字欄位一樣走真正的 SQL WHERE，不能只是抓回來後在 JS 裡篩選。isActive
// 原本也是這樣猜的，2026-09-04 起 sitca-ts 開了權威欄位 is_actively_managed，直接讀那個，
// 不用再猜，見 queryBuilder.ts 的說明。

export type EtfFieldKind = 'numeric' | 'categorical' | 'date';

export interface NumericFieldDefinition {
  kind: 'numeric';
  field: string;
  label: string;
  sqlColumn: string; // base（或 expense/expensePivot/expenseLatestFullYear）查詢裡的欄位別名
  needsExpenseJoin?: boolean; // 舊：單一「最新完整年度」費用率，見 expenseRatio
  needsExpensePivotJoin?: boolean; // 逐年費用率 pivot，見下方 expenseRatio<year> 系列
  needsExpenseLatestFullYearJoin?: boolean; // 最新完整年度的費用率細項拆分，見下方經理費等欄位
  needsPremiumDiscountJoin?: boolean; // 折溢價率，見下方 premiumDiscountPct
}

export interface CategoricalFieldDefinition {
  kind: 'categorical';
  field: string;
  label: string;
  sqlColumn: string;
  staticValues?: string[]; // 選項固定已知的（market/isActive/belowStatutoryThreshold）；沒給的話（assetClass）呼叫端要現查 distinct 值
  isBoolean?: boolean; // 底層是 boolean 欄位（isActive/belowStatutoryThreshold）——filter values 的 'true'/'false' 字串要轉真正的布林值再比對，不是文字欄位直接比對字串
}

// 日期欄位（目前只有 establishedDate）——跟數字欄位一樣走 min/max 範圍篩選，但值是
// 'YYYY-MM-DD' 字串不是數字，SQL 比較用日期型別比較，不是字串字典序（剛好兩者對 ISO
// 格式的日期字串結果一致，但語意上仍是日期比較，獨立成一個 kind 避免跟數字欄位混淆）。
export interface DateFieldDefinition {
  kind: 'date';
  field: string;
  label: string;
  sqlColumn: string;
}

export type EtfFieldDefinition = NumericFieldDefinition | CategoricalFieldDefinition | DateFieldDefinition;

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
  // 2026-09-04 sitca-ts 新增欄位——法定下市規模門檻，純資訊性數字，跟 belowStatutoryThreshold
  // （下面 CATEGORICAL_FIELDS）是同一組資料的一體兩面：這是門檻本身，那個是「是否低於門檻」。
  statutoryAumThreshold: { kind: 'numeric', field: 'statutoryAumThreshold', label: '法定下市規模門檻（新台幣）', sqlColumn: 'statutory_aum_threshold' },
  // 2026-09-10 新增：折溢價率 = (市價 - 淨值) / 淨值 * 100，取「淨值跟市價同一天都有資料」
  // 的最新一天（見 queryBuilder.ts 的 buildPremiumDiscountJoin）。正值代表市價高於淨值
  // （溢價），負值代表市價低於淨值（折價）。資料源是 sitca-ts 的 export.fundclear_etf_nav_history
  // （逐日淨值）+ export.etf_closing_price（twse-ts/tpex-ts push 的逐日市價），市價回填
  // 深度比淨值淺很多（上市 2020-11 起、上櫃 2021-09 起），見 TECH_DEBT.md。
  premiumDiscountPct: { kind: 'numeric', field: 'premiumDiscountPct', label: '折溢價率', sqlColumn: 'premium_discount_pct', needsPremiumDiscountJoin: true },
};

// 2026-09-08 新增：分年度總費用率（bff-ts 轉達 web-nuxt 需求，2001~2026 共 26 年，橫向
// 瀏覽/比較用，不是只顯示近幾年）。資料源刻意跟上面的 expenseRatio 不同：這裡用
// export.fund_expense_ratio_annual_full_year（sitca-ts 已經濾掉 is_partial_year=true
// 的不完整期間資料，逐檔逐年判斷，比「calendar year - 1」這種全體套一個門檻精確）；
// expenseRatio 是舊的 export.fund_expense_ratio_annual 表 + 手動猜「最新完整年度」，
// 兩者資料源/精確度不同，這次刻意不去動既有欄位（避免影響任何既有消費端），只加新的。
// 見 queryBuilder.ts 的 buildExpensePivotJoin。
export const EXPENSE_RATIO_FULL_YEAR_RANGE = { start: 2001, end: 2026 } as const;
for (let year = EXPENSE_RATIO_FULL_YEAR_RANGE.start; year <= EXPENSE_RATIO_FULL_YEAR_RANGE.end; year++) {
  NUMERIC_FIELDS[`expenseRatio${year}`] = {
    kind: 'numeric',
    field: `expenseRatio${year}`,
    label: `總費用率（${year}）`,
    sqlColumn: `expense_ratio_${year}`,
    needsExpensePivotJoin: true,
  };
}

// 2026-09-08 新增：成立日、費用率細項拆分（sitca 建議的 ETF 欄位分類「身分/分類」「成本」
// 兩組，使用者確認要做的部分）。
export const DATE_FIELDS: Record<string, DateFieldDefinition> = {
  // established_date 本來就在 base CTE 裡（給費用率的完整年度判斷用，見 queryBuilder.ts
  // 的 buildExpenseJoin），但沒有曝露成可篩選/顯示的欄位——現在補上。
  establishedDate: { kind: 'date', field: 'establishedDate', label: '成立日', sqlColumn: 'established_date' },
};

// 費用率細項拆分——只用「最新一個完整年度」（跟 expenseRatio 同一種「目前」語意，不是
// 分年度系列），但資料源改用 export.fund_expense_ratio_annual_full_year（已經濾掉
// is_partial_year=true 的不完整期間資料），不沿用 expenseRatio 舊表 + 手動猜
// 「calendar year - 1」那套——這是本檔案第一次用「該基金自己最新一筆完整年度」而不是
// 「全體套同一個基準年」，見 queryBuilder.ts 的 buildExpenseLatestFullYearJoin。
export const NUMERIC_FIELDS_FEE_BREAKDOWN: Record<string, NumericFieldDefinition> = {
  managementFeeRate: { kind: 'numeric', field: 'managementFeeRate', label: '經理費率（最新完整年度）', sqlColumn: 'management_fee_rate', needsExpenseLatestFullYearJoin: true },
  custodianFeeRate: { kind: 'numeric', field: 'custodianFeeRate', label: '保管費率（最新完整年度）', sqlColumn: 'custodian_fee_rate', needsExpenseLatestFullYearJoin: true },
  guaranteeFeeRate: { kind: 'numeric', field: 'guaranteeFeeRate', label: '保證費率（最新完整年度）', sqlColumn: 'guarantee_fee_rate', needsExpenseLatestFullYearJoin: true },
  otherFeeRate: { kind: 'numeric', field: 'otherFeeRate', label: '其他費用率（最新完整年度）', sqlColumn: 'other_fee_rate', needsExpenseLatestFullYearJoin: true },
  commissionRate: { kind: 'numeric', field: 'commissionRate', label: '手續費率（最新完整年度）', sqlColumn: 'commission_rate', needsExpenseLatestFullYearJoin: true },
  transactionTaxRate: { kind: 'numeric', field: 'transactionTaxRate', label: '交易稅率（最新完整年度）', sqlColumn: 'transaction_tax_rate', needsExpenseLatestFullYearJoin: true },
  etfTradingFeeRate: { kind: 'numeric', field: 'etfTradingFeeRate', label: 'ETF買賣手續費率（最新完整年度）', sqlColumn: 'etf_trading_fee_rate', needsExpenseLatestFullYearJoin: true },
};
Object.assign(NUMERIC_FIELDS, NUMERIC_FIELDS_FEE_BREAKDOWN);

export const CATEGORICAL_FIELDS: Record<string, CategoricalFieldDefinition> = {
  market: { kind: 'categorical', field: 'market', label: '市場別', sqlColumn: 'market', staticValues: ['TWSE', 'TPEx'] },
  // assetClass 的選項不寫死——之後 sitca-ts 分類異動（例如新增一種成分類型）會直接反映在
  // GET /etf-screener/filters，不用改程式碼，見 service.ts 的 getFilterCatalog。
  assetClass: { kind: 'categorical', field: 'assetClass', label: '資產類型', sqlColumn: 'asset_class' },
  isActive: { kind: 'categorical', field: 'isActive', label: '主動式ETF', sqlColumn: 'is_active', staticValues: ['true', 'false'], isBoolean: true },
  // 2026-09-04 sitca-ts 新增欄位——下市風險近似警示（規模低於法定門檻），見 queryBuilder.ts
  // 的說明，跟 NUMERIC_FIELDS.statutoryAumThreshold 是同一組資料的一體兩面。
  belowStatutoryThreshold: { kind: 'categorical', field: 'belowStatutoryThreshold', label: '規模低於法定下市門檻', sqlColumn: 'below_statutory_threshold', staticValues: ['true', 'false'], isBoolean: true },
  // distributionFrequency：2026-09-02 web-nuxt 轉達的需求（退休/存股儀表板要篩配息頻率，
  // 單筆配息滿 2 萬會扣二代健保補充保費，月配息較容易避開單筆超標），選項也不寫死，見
  // queryBuilder.ts 的 distribution_frequency 表達式。
  distributionFrequency: { kind: 'categorical', field: 'distributionFrequency', label: '配息頻率', sqlColumn: 'distribution_frequency' },
};

export const ALL_FIELDS: Record<string, EtfFieldDefinition> = { ...NUMERIC_FIELDS, ...CATEGORICAL_FIELDS, ...DATE_FIELDS };

export const resolveEtfField = (field: string): EtfFieldDefinition | null => ALL_FIELDS[field] ?? null;
