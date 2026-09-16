import { Prisma } from '#generated/sitca-export-client';
import { EXPENSE_RATIO_FULL_YEAR_RANGE, type NumericFieldDefinition, type CategoricalFieldDefinition, type DateFieldDefinition } from './etfFieldRegistry';

// 2026-09-17 重構 Phase 2：從 http/modules/market/etfScreener/queryBuilder.ts 搬來——只有 Prisma.sql
// 的組裝（純函式、寫死 sitca export view 的表名欄位名），執行交給 ./etfQueries.ts 的 runEtfRawQuery。

// 核心查詢組裝——ETF 資料只有 etf_basic_info/etf_monthly_statement/etf_performance 三張表
// （用 symbol+year_month 對齊），不像股票 screener 要動態拼多張各自獨立的 curated
// 表，這裡直接組一個固定形狀的 base CTE（所有欄位都在同一個查詢裡），filters/columns/sort
// 都是對 base（或加上 expense）的欄位下條件，不需要股票那套「每個 field 各自找表、動態
// JOIN」的通用機制。
//
// market/asset_class 是用 SQL 表達式現場從 category 字串拆出來的（不是獨立欄位、不是另外
// sync 一張表）——2026-09-02 應使用者要求，這樣類別欄位才能像數字欄位一樣走真正的 SQL
// WHERE，不是抓回來後在 JS 篩選。is_active 原本也是這樣用「category 有沒有『ETF_...ETF』
// 成分類型後綴」猜的（見 etfRanking/parseCategory.ts 已經驗證過的同一套邏輯，36 檔主動式
// ETF 完全對應 category 沒有後綴的情況），2026-09-04 起 sitca-ts 直接開了權威欄位
// is_actively_managed，不用再猜，直接讀那個欄位。distribution_frequency 同樣是從 distribution_class_info
// 現場拆出來的（月配/季配/半年配/年配/一年兩次配息/其他/不分配），見
// etfRanking/parseDistribution.ts 對應的 JS 版本——這個欄位是應 web-nuxt 需求新增，讓退休/
// 存股儀表板能篩選配息頻率（單筆配息滿 2 萬會扣二代健保補充保費，月配息較容易避開單筆超標），
// 純客觀顯示/篩選欄位，不是投資建議。
//
// ⚠️ distribution_frequency 的正則字串裡故意寫兩個反斜線 \\( \\)：這段 SQL 是包在 JS 樣板
// 字面值裡，單一個 \( 的反斜線不是 JS 認得的合法轉義序列，送進 Postgres 前就會被 JS 吃掉，
// Postgres 收到的正則會變成純分組符號、不是「跳脫括號比對字面值」，第一版漏了這個，選項值
// 因此多包了一層括號（例如「(月配)」而不是「月配」）——同一套查詢邏輯在 service.ts 的
// CATEGORICAL_DISTINCT_VALUES.distributionFrequency 也要一起改，兩處都是同一個陷阱。
const buildBaseCte = (yearMonth: string): Prisma.Sql => Prisma.sql`
  base AS (
    SELECT
      b.symbol AS symbol,
      b.fund_name,
      b.security_short_name AS short_name,
      b.company_name,
      b.category,
      b.established_date,
      CASE WHEN b.category LIKE '上市%' THEN 'TWSE' WHEN b.category LIKE '上櫃%' THEN 'TPEx' ELSE NULL END AS market,
      substring(b.category from 'ETF_(.+)ETF') AS asset_class,
      b.is_actively_managed AS is_active,
      CASE WHEN b.distribution_class_info LIKE '%不分配%' THEN '不分配' ELSE substring(b.distribution_class_info from '分配\\((.+)\\)') END AS distribution_frequency,
      m.fund_tax_id,
      m.aum_twd AS aum,
      m.total_holders AS holders,
      (m.subscription_amount_twd - m.redemption_amount_twd) AS net_flow,
      m.dca_amount_twd AS dca_amount,
      m.market_share_rate,
      m.nav_twd AS nav,
      m.statutory_aum_threshold_twd AS statutory_aum_threshold,
      m.aum_below_statutory_threshold AS below_statutory_threshold,
      p.return_3m,
      p.return_6m,
      p.return_1y,
      p.return_2y,
      p.return_3y,
      p.return_5y,
      p.return_ytd,
      p.return_10y
    FROM "export"."etf_basic_info" b
    JOIN "export"."etf_monthly_statement" m ON m.symbol = b.symbol AND m.year_month = b.year_month
    JOIN "export"."etf_performance" p ON p.symbol = b.symbol AND p.year_month = b.year_month
    WHERE b.year_month = ${yearMonth}
  )
`;

// 總費用率只用「最新一個完整年度」——今年還沒過完的資料不可靠（見 etfRanking 的
// resolveExpenseRatioMetric 說明，00961 案例：未過完的年度費用率反而是完整年度的 10 倍）。
// 發行日在這個基準年（或更晚）的 ETF 那一年不滿一整年，expense_ratio 給 null，不是排除整檔
// ETF（其他欄位還是看得到），跟 etfRanking 排行榜「直接排除」不同——screener 是列表瀏覽情境，
// 缺一個欄位不代表這檔 ETF 不該出現在清單裡。
const buildExpenseJoin = (): { cte: Prisma.Sql; join: Prisma.Sql } => {
  const latestCompleteYear = new Date().getFullYear() - 1;
  const cte = Prisma.sql`
    expense AS (
      SELECT fund_tax_id, total_rate FROM "export"."fund_expense_ratio_annual" WHERE year = ${latestCompleteYear}
    )
  `;
  const join = Prisma.sql`
    LEFT JOIN expense ON expense.fund_tax_id = base.fund_tax_id
      AND EXTRACT(YEAR FROM base.established_date) < ${latestCompleteYear}
  `;
  return { cte, join };
};

// 分年度總費用率 pivot——一次把 export.fund_expense_ratio_annual_full_year（已經濾掉
// is_partial_year=true 的不完整期間資料）用條件式聚合攤平成「一個 fund_tax_id 一列、
// 每年一欄」，不是對 26 個年份各自 LEFT JOIN 26 次（那樣可讀性差、SQL 也長很多）。
// 欄位別名 expense_ratio_<year> 要跟 fieldRegistry.ts 的 sqlColumn 完全對應。
const buildExpensePivotJoin = (): { cte: Prisma.Sql; join: Prisma.Sql } => {
  const yearColumns: Prisma.Sql[] = [];
  for (let year = EXPENSE_RATIO_FULL_YEAR_RANGE.start; year <= EXPENSE_RATIO_FULL_YEAR_RANGE.end; year++) {
    yearColumns.push(Prisma.sql`MAX(CASE WHEN year = ${year} THEN total_rate END) AS ${Prisma.raw(`"expense_ratio_${year}"`)}`);
  }
  const cte = Prisma.sql`
    expense_pivot AS (
      SELECT fund_tax_id, ${Prisma.join(yearColumns, ', ')}
      FROM "export"."fund_expense_ratio_annual_full_year"
      GROUP BY fund_tax_id
    )
  `;
  const join = Prisma.sql`LEFT JOIN expense_pivot ON expense_pivot.fund_tax_id = base.fund_tax_id`;
  return { cte, join };
};

// 費用率細項拆分（經理費/保管費/保證費/其他/手續費/交易稅/ETF買賣手續費）——跟
// buildExpenseJoin 的「全體套同一個 calendar year - 1 基準年」不同，這裡是「該基金
// 自己最新一筆完整年度」：DISTINCT ON (fund_tax_id) + ORDER BY year DESC 直接取每個
// fund_tax_id 在 fund_expense_ratio_annual_full_year（已經濾掉不完整期間）裡最新的
// 一列，不用手動判斷「今年還沒過完」，因為這張 view 本來就已經濾掉不完整年度。
const buildExpenseLatestFullYearJoin = (): { cte: Prisma.Sql; join: Prisma.Sql } => {
  const cte = Prisma.sql`
    expense_latest AS (
      SELECT DISTINCT ON (fund_tax_id)
        fund_tax_id, management_fee_rate, custodian_fee_rate, guarantee_fee_rate,
        other_fee_rate, commission_rate, transaction_tax_rate, etf_trading_fee_rate
      FROM "export"."fund_expense_ratio_annual_full_year"
      ORDER BY fund_tax_id, year DESC
    )
  `;
  const join = Prisma.sql`LEFT JOIN expense_latest ON expense_latest.fund_tax_id = base.fund_tax_id`;
  return { cte, join };
};

// 折溢價率——取「淨值跟市價同一天都有資料」的最新一天，不是各自抓各自的最新一天再硬湊
// （那樣會把不同交易日的價格跟淨值算在一起，折溢價數字會失真）。DISTINCT ON (symbol) +
// ORDER BY date DESC 直接對 JOIN 過的結果取每個 symbol 最新一列，同一個 CTE 裡順便算好
// 百分比，不用另外查一次「這個 symbol 最新共同日期是哪天」。nav_value 為 0 或 null 時
// 沒有意義，回傳 null（不是無限大或 0）。
const buildPremiumDiscountJoin = (): { cte: Prisma.Sql; join: Prisma.Sql } => {
  const cte = Prisma.sql`
    premium_discount AS (
      SELECT DISTINCT ON (n.symbol)
        n.symbol,
        CASE WHEN n.nav_value IS NOT NULL AND n.nav_value <> 0 THEN ROUND(((c.close - n.nav_value) / n.nav_value * 100)::numeric, 2) END AS premium_discount_pct
      FROM "export"."fundclear_etf_nav_history" n
      JOIN "export"."etf_closing_price" c ON c.symbol = n.symbol AND c.date = n.date
      ORDER BY n.symbol, n.date DESC
    )
  `;
  const join = Prisma.sql`LEFT JOIN premium_discount ON premium_discount.symbol = base.symbol`;
  return { cte, join };
};

const q = (identifier: string): Prisma.Sql => Prisma.raw(`"${identifier}"`);

// expenseRatio 的值來自 expense CTE（別名 total_rate）；expenseRatio<year> 系列來自
// expense_pivot CTE（見 buildExpensePivotJoin）；費用率細項拆分來自 expense_latest CTE
// （見 buildExpenseLatestFullYearJoin）；其他數字/類別/日期欄位都在 base 裡——跟
// columnSelectSql 用同一個判斷依據，兩處都要參照這裡才不會漏掉、各自猜錯來源表。
const fieldSourceSql = (definition: NumericFieldDefinition | CategoricalFieldDefinition | DateFieldDefinition): Prisma.Sql => {
  if (definition.kind === 'numeric' && definition.needsExpenseJoin) return Prisma.raw('expense.total_rate');
  if (definition.kind === 'numeric' && definition.needsExpensePivotJoin) return Prisma.sql`expense_pivot.${q(definition.sqlColumn)}`;
  if (definition.kind === 'numeric' && definition.needsExpenseLatestFullYearJoin) return Prisma.sql`expense_latest.${q(definition.sqlColumn)}`;
  if (definition.kind === 'numeric' && definition.needsPremiumDiscountJoin) return Prisma.sql`premium_discount.${q(definition.sqlColumn)}`;
  return Prisma.sql`base.${q(definition.sqlColumn)}`;
};

export interface NumericFilterCondition {
  kind: 'numeric';
  definition: NumericFieldDefinition;
  min: number | null;
  max: number | null;
  exclude: boolean;
}

export interface CategoricalFilterCondition {
  kind: 'categorical';
  definition: CategoricalFieldDefinition;
  values: string[];
}

// 日期欄位：跟數字欄位同一種 min/max 範圍語意（exclude 邏輯也相同），只是比較值是日期
// 字串（'YYYY-MM-DD'）不是數字，且一律用 base 裡的欄位（目前只有 establishedDate，
// 沒有需要額外 JOIN 的日期欄位）。
export interface DateFilterCondition {
  kind: 'date';
  definition: DateFieldDefinition;
  min: string | null;
  max: string | null;
  exclude: boolean;
}

export type FilterCondition = NumericFilterCondition | CategoricalFilterCondition | DateFilterCondition;

// 數字欄位：exclude=false 保留落在 [min,max] 內的值（null 一律排除）；exclude=true 保留落在
// 範圍外的值（min/max 都沒給時「外面」沒有邊界，篩掉全部）——跟股票 screener 同一套語意。
const buildNumericCondition = (condition: NumericFilterCondition): Prisma.Sql => {
  const col = fieldSourceSql(condition.definition);
  if (!condition.exclude) {
    const parts: Prisma.Sql[] = [Prisma.sql`${col} IS NOT NULL`];
    if (condition.min !== null) parts.push(Prisma.sql`${col} >= ${condition.min}`);
    if (condition.max !== null) parts.push(Prisma.sql`${col} <= ${condition.max}`);
    return Prisma.sql`(${Prisma.join(parts, ' AND ')})`;
  }
  if (condition.min === null && condition.max === null) return Prisma.sql`FALSE`;
  const bounds: Prisma.Sql[] = [];
  if (condition.min !== null) bounds.push(Prisma.sql`${col} < ${condition.min}`);
  if (condition.max !== null) bounds.push(Prisma.sql`${col} > ${condition.max}`);
  return Prisma.sql`(${col} IS NOT NULL AND (${Prisma.join(bounds, ' OR ')}))`;
};

// 日期欄位：跟 buildNumericCondition 同一套 exclude 語意，比較值換成日期字串，Postgres
// 會自動把 'YYYY-MM-DD' 字串轉成 date 型別比較，不是字串字典序比較（雖然對 ISO 格式
// 兩者結果一致，但語意上是日期比較）。
const buildDateCondition = (condition: DateFilterCondition): Prisma.Sql => {
  const col = fieldSourceSql(condition.definition);
  if (!condition.exclude) {
    const parts: Prisma.Sql[] = [Prisma.sql`${col} IS NOT NULL`];
    if (condition.min !== null) parts.push(Prisma.sql`${col} >= ${condition.min}::date`);
    if (condition.max !== null) parts.push(Prisma.sql`${col} <= ${condition.max}::date`);
    return Prisma.sql`(${Prisma.join(parts, ' AND ')})`;
  }
  if (condition.min === null && condition.max === null) return Prisma.sql`FALSE`;
  const bounds: Prisma.Sql[] = [];
  if (condition.min !== null) bounds.push(Prisma.sql`${col} < ${condition.min}::date`);
  if (condition.max !== null) bounds.push(Prisma.sql`${col} > ${condition.max}::date`);
  return Prisma.sql`(${col} IS NOT NULL AND (${Prisma.join(bounds, ' OR ')}))`;
};

// 類別欄位：values 是「屬於這幾個值之一」（IN 語意），不是範圍。isActive/belowStatutoryThreshold
// 是 boolean 欄位（見 fieldRegistry.ts 的 isBoolean 標記），'true'/'false' 字串要轉成實際
// 布林值才能比對，市場別/資產類型是文字欄位直接比對字串。
const buildCategoricalCondition = (condition: CategoricalFilterCondition): Prisma.Sql => {
  const col = Prisma.sql`base.${q(condition.definition.sqlColumn)}`;
  if (condition.values.length === 0) return Prisma.sql`FALSE`;

  if (condition.definition.isBoolean) {
    const bools = condition.values.map((v) => v === 'true');
    return Prisma.sql`${col} IN (${Prisma.join(bools)})`;
  }
  return Prisma.sql`${col} IN (${Prisma.join(condition.values)})`;
};

export interface ColumnRef {
  field: string;
  definition: NumericFieldDefinition | CategoricalFieldDefinition | DateFieldDefinition;
}

export interface SortSpec {
  field: string; // "symbol" 或 columns 裡其中一個 field，service.ts 已驗證過
  order: 'asc' | 'desc';
}

const columnSelectSql = (column: ColumnRef): Prisma.Sql => Prisma.sql`${fieldSourceSql(column.definition)} AS ${Prisma.raw(`"${column.field}"`)}`;

export const buildEtfScreenerSql = (
  yearMonth: string,
  filters: FilterCondition[],
  columns: ColumnRef[],
  page: number,
  pageSize: number,
  sort: SortSpec | null
): Prisma.Sql => {
  const sortDefinition = sort ? columns.find((c) => c.field === sort.field)?.definition : undefined;
  const needsExpense = filters.some((f) => f.kind === 'numeric' && f.definition.needsExpenseJoin) || columns.some((c) => c.definition.kind === 'numeric' && c.definition.needsExpenseJoin) || sort?.field === 'expenseRatio';
  const needsExpensePivot =
    filters.some((f) => f.kind === 'numeric' && f.definition.needsExpensePivotJoin) ||
    columns.some((c) => c.definition.kind === 'numeric' && c.definition.needsExpensePivotJoin) ||
    (sortDefinition?.kind === 'numeric' && sortDefinition.needsExpensePivotJoin === true);
  const needsExpenseLatestFullYear =
    filters.some((f) => f.kind === 'numeric' && f.definition.needsExpenseLatestFullYearJoin) ||
    columns.some((c) => c.definition.kind === 'numeric' && c.definition.needsExpenseLatestFullYearJoin) ||
    (sortDefinition?.kind === 'numeric' && sortDefinition.needsExpenseLatestFullYearJoin === true);
  const needsPremiumDiscount =
    filters.some((f) => f.kind === 'numeric' && f.definition.needsPremiumDiscountJoin) ||
    columns.some((c) => c.definition.kind === 'numeric' && c.definition.needsPremiumDiscountJoin) ||
    (sortDefinition?.kind === 'numeric' && sortDefinition.needsPremiumDiscountJoin === true);

  const baseCte = buildBaseCte(yearMonth);
  const expense = needsExpense ? buildExpenseJoin() : null;
  const expensePivot = needsExpensePivot ? buildExpensePivotJoin() : null;
  const expenseLatest = needsExpenseLatestFullYear ? buildExpenseLatestFullYearJoin() : null;
  const premiumDiscount = needsPremiumDiscount ? buildPremiumDiscountJoin() : null;
  const ctes = [baseCte, ...(expense ? [expense.cte] : []), ...(expensePivot ? [expensePivot.cte] : []), ...(expenseLatest ? [expenseLatest.cte] : []), ...(premiumDiscount ? [premiumDiscount.cte] : [])];
  const joinList = [...(expense ? [expense.join] : []), ...(expensePivot ? [expensePivot.join] : []), ...(expenseLatest ? [expenseLatest.join] : []), ...(premiumDiscount ? [premiumDiscount.join] : [])];
  const fromSql = joinList.length > 0 ? Prisma.sql`FROM base ${Prisma.join(joinList, ' ')}` : Prisma.sql`FROM base`;

  const selectCols = columns.map(columnSelectSql);
  const selectList = [Prisma.sql`base.symbol AS symbol`, Prisma.sql`base.fund_name AS "fundName"`, Prisma.sql`base.short_name AS "shortName"`, Prisma.sql`base.company_name AS "companyName"`, Prisma.sql`base.category AS category`, ...selectCols, Prisma.sql`COUNT(*) OVER() AS total_count`];

  const whereConditions = filters.map((f) => (f.kind === 'numeric' ? buildNumericCondition(f) : f.kind === 'date' ? buildDateCondition(f) : buildCategoricalCondition(f)));
  const whereSql = whereConditions.length > 0 ? Prisma.join(whereConditions, ' AND ') : Prisma.sql`TRUE`;

  const offset = (page - 1) * pageSize;

  const sortColumnSql =
    !sort || sort.field === 'symbol'
      ? Prisma.raw('symbol')
      : (() => {
          const found = columns.find((c) => c.field === sort.field);
          if (!found) throw new Error(`buildEtfScreenerSql: sortField "${sort.field}" 不在 columns 裡，service.ts 應該在呼叫前就驗證過這件事。`);
          return Prisma.raw(`"${found.field}"`);
        })();
  // bff-ts 2026-09-09 回報：desc 排序時 null 值跑到最前面——Postgres 對 DESC 預設
  // NULLS FIRST（ASC 預設 NULLS LAST，剛好符合預期，一直沒發現）。這裡明確加 NULLS LAST，
  // 不管 asc/desc，null 值一律排最後，是使用者預期的「缺資料排最後面」語意，不是 SQL 預設值。
  const orderDirection = sort?.order === 'desc' ? Prisma.raw('DESC NULLS LAST') : Prisma.raw('ASC');
  const orderBySql = sort && sort.field !== 'symbol' ? Prisma.sql`${sortColumnSql} ${orderDirection}, symbol ASC` : Prisma.sql`${sortColumnSql} ${orderDirection}`;

  return Prisma.sql`
    WITH ${Prisma.join(ctes, ', ')}
    SELECT ${Prisma.join(selectList, ', ')}
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY ${orderBySql}
    LIMIT ${pageSize} OFFSET ${offset}
  `;
};
