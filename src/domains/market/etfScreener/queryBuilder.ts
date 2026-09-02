import { Prisma } from '#generated/sitca-export-client';
import { NUMERIC_FIELDS, CATEGORICAL_FIELDS, type NumericFieldDefinition, type CategoricalFieldDefinition } from './fieldRegistry';

// 核心查詢組裝——ETF 資料只有 etf_basic_info/etf_monthly_statement/etf_performance 三張表
// （用 security_code+year_month 對齊），不像股票 screener 要動態拼多張各自獨立的 curated
// 表，這裡直接組一個固定形狀的 base CTE（所有欄位都在同一個查詢裡），filters/columns/sort
// 都是對 base（或加上 expense）的欄位下條件，不需要股票那套「每個 field 各自找表、動態
// JOIN」的通用機制。
//
// market/asset_class/is_active 是用 SQL 表達式現場從 category 字串拆出來的（不是獨立欄位、
// 不是另外 sync 一張表）——2026-09-02 應使用者要求，這樣類別欄位才能像數字欄位一樣走真正的
// SQL WHERE，不是抓回來後在 JS 篩選。判斷依據：category 有沒有「ETF_...ETF」這個成分類型
// 後綴，見 etfRanking/parseCategory.ts 已經驗證過的同一套邏輯（36 檔主動式 ETF 完全對應
// category 沒有後綴的情況）。distribution_frequency 同樣是從 distribution_class_info
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
      b.security_code AS symbol,
      b.fund_name,
      b.security_short_name AS short_name,
      b.company_name,
      b.category,
      b.established_date,
      CASE WHEN b.category LIKE '上市%' THEN 'TWSE' WHEN b.category LIKE '上櫃%' THEN 'TPEx' ELSE NULL END AS market,
      substring(b.category from 'ETF_(.+)ETF') AS asset_class,
      (b.category !~ '^(上市|上櫃)ETF_.+ETF$') AS is_active,
      CASE WHEN b.distribution_class_info LIKE '%不分配%' THEN '不分配' ELSE substring(b.distribution_class_info from '分配\\((.+)\\)') END AS distribution_frequency,
      m.fund_tax_id,
      m.aum_twd AS aum,
      m.total_holders AS holders,
      (m.subscription_amount_twd - m.redemption_amount_twd) AS net_flow,
      m.dca_amount_twd AS dca_amount,
      m.market_share_rate,
      m.nav_twd AS nav,
      p.return_3m,
      p.return_6m,
      p.return_1y,
      p.return_2y,
      p.return_3y,
      p.return_5y,
      p.return_ytd,
      p.return_10y
    FROM "export"."etf_basic_info" b
    JOIN "export"."etf_monthly_statement" m ON m.security_code = b.security_code AND m.year_month = b.year_month
    JOIN "export"."etf_performance" p ON p.security_code = b.security_code AND p.year_month = b.year_month
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
      SELECT fund_id, total_rate FROM "export"."fund_expense_ratio_annual" WHERE year = ${latestCompleteYear}
    )
  `;
  const join = Prisma.sql`
    LEFT JOIN expense ON expense.fund_id = base.fund_tax_id
      AND EXTRACT(YEAR FROM base.established_date) < ${latestCompleteYear}
  `;
  return { cte, join };
};

const q = (identifier: string): Prisma.Sql => Prisma.raw(`"${identifier}"`);

// expenseRatio 的值來自 expense CTE（別名 total_rate），其他數字/類別欄位都在 base 裡——
// 跟 columnSelectSql 用同一個判斷依據，兩處都要參照這裡才不會漏掉、各自猜錯來源表。
const fieldSourceSql = (definition: NumericFieldDefinition | CategoricalFieldDefinition): Prisma.Sql =>
  definition.kind === 'numeric' && definition.needsExpenseJoin ? Prisma.raw('expense.total_rate') : Prisma.sql`base.${q(definition.sqlColumn)}`;

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

export type FilterCondition = NumericFilterCondition | CategoricalFilterCondition;

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

// 類別欄位：values 是「屬於這幾個值之一」（IN 語意），不是範圍。isActive 是 boolean 欄位，
// 'true'/'false' 字串要轉成實際布林值才能比對，市場別/資產類型是文字欄位直接比對字串。
const buildCategoricalCondition = (condition: CategoricalFilterCondition): Prisma.Sql => {
  const col = Prisma.sql`base.${q(condition.definition.sqlColumn)}`;
  if (condition.values.length === 0) return Prisma.sql`FALSE`;

  if (condition.definition.field === 'isActive') {
    const bools = condition.values.map((v) => v === 'true');
    return Prisma.sql`${col} IN (${Prisma.join(bools)})`;
  }
  return Prisma.sql`${col} IN (${Prisma.join(condition.values)})`;
};

export interface ColumnRef {
  field: string;
  definition: NumericFieldDefinition | CategoricalFieldDefinition;
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
  const needsExpense = filters.some((f) => f.kind === 'numeric' && f.definition.needsExpenseJoin) || columns.some((c) => c.definition.kind === 'numeric' && c.definition.needsExpenseJoin) || sort?.field === 'expenseRatio';

  const baseCte = buildBaseCte(yearMonth);
  const expense = needsExpense ? buildExpenseJoin() : null;
  const ctes = expense ? [baseCte, expense.cte] : [baseCte];
  const fromSql = expense ? Prisma.sql`FROM base ${expense.join}` : Prisma.sql`FROM base`;

  const selectCols = columns.map(columnSelectSql);
  const selectList = [Prisma.sql`base.symbol AS symbol`, Prisma.sql`base.fund_name AS "fundName"`, Prisma.sql`base.short_name AS "shortName"`, Prisma.sql`base.company_name AS "companyName"`, Prisma.sql`base.category AS category`, ...selectCols, Prisma.sql`COUNT(*) OVER() AS total_count`];

  const whereConditions = filters.map((f) => (f.kind === 'numeric' ? buildNumericCondition(f) : buildCategoricalCondition(f)));
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
  const orderDirection = sort?.order === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
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
