import { Prisma } from '#generated/analysis-client';
import type { FieldRef } from './fieldResolver';

// 核心查詢組裝邏輯——2026-09-08 重建，改成對 pitMetrics 共用的 metric_values 表查詢，取代
// 已刪除的 metricTableRegistry 那套「一指標一表」解析機制。metricCode/basis 都經過
// fieldResolver.resolveFieldOrThrow 驗證過，只會是 metricDefinitionRegistry 裡真實存在的
// 組合（不是使用者可以任意輸入字串直接拼進 SQL）；filter 的 min/max 數值一律透過 Prisma.sql
// 的參數化模板帶入，不是字串拼接。
//
// 關鍵簡化：舊架構要分「季報型」（year/season 排序）跟「每日型」（date 欄位排序）兩種形狀，
// pitMetrics 全部欄位統一都是 metric_values 這一張表、統一的
// (fiscal_year, fiscal_quarter, knowledge_date) 三欄排序鍵——逐日型指標的 fiscal_quarter
// 固定是 sentinel 值 0（不是季報 1~4），同一年的多筆逐日資料靠 knowledge_date 這個最終排序
// 鍵正確取到最新一筆（不同天的 fiscal_year 本身也會不同，除非同一年內比較，那正是
// knowledge_date 要負責的事）——不需要像 queryMetricHistory.ts 那樣特別處理「逐日型指標
// 不適用」的例外，因為這裡只取「最新一筆」，不是要列出「每一期」的完整歷史。

const DATA_TYPE = '2'; // 合併報表——跟 roe-history 等既有 pitMetrics 端點同一個慣例，不對外曝露
const SUBSIDIARY_COMPANY_ID = ''; // 母公司本身

const q = (identifier: string): Prisma.Sql => Prisma.raw(`"${identifier}"`);

interface CteRef {
  alias: string;
  metricCode: string;
  basis: string;
}

// 每個唯一的 (metricCode, basis) 組合各自一個 CTE，不是每個 field 各自一個——同一組合
// 出現在 filters 又出現在 columns 時（例如同時拿 roe.TTM 篩選又要顯示），只查一次。alias
// 必須是 (metricCode, basis) 的純函式（不能用陣列索引），因為 buildScreenerSql/
// buildRankingSql 會分別對 filters 跟 columns 各自呼叫一次 dedupCtes 再合併——如果 alias
// 依呼叫當下的陣列位置而定，同一個 (metricCode, basis) 在兩次呼叫裡可能被指派不同 alias，
// 合併 Map 時後面的呼叫會覆蓋前面算出來的 alias，但 buildFromClause 用的是前面那次呼叫的
// 結果，兩邊對不上會產生「JOIN 到一個沒有被定義過的 CTE alias」的壞掉 SQL。
const cteAliasFor = (metricCode: string, basis: string): string => `latest_${metricCode}_${basis}`;

const dedupCtes = (fields: FieldRef[]): Map<string, CteRef> => {
  const map = new Map<string, CteRef>();
  for (const f of fields) {
    const key = `${f.metricCode}:${f.basis}`;
    if (!map.has(key)) map.set(key, { alias: cteAliasFor(f.metricCode, f.basis), metricCode: f.metricCode, basis: f.basis });
  }
  return map;
};

const buildCte = (ref: CteRef): Prisma.Sql => {
  const alias = Prisma.raw(ref.alias);
  return Prisma.sql`${alias} AS (
    SELECT DISTINCT ON (${q('symbol')}) *
    FROM ${q('metric_values')}
    WHERE ${q('metric_code')} = ${ref.metricCode} AND ${q('basis')} = ${ref.basis} AND ${q('data_type')} = ${DATA_TYPE} AND ${q('subsidiary_company_id')} = ${SUBSIDIARY_COMPANY_ID}
    ORDER BY ${q('symbol')}, ${q('fiscal_year')} DESC, ${q('fiscal_quarter')} DESC, ${q('knowledge_date')} DESC
  )`;
};

const cteKeyFor = (f: FieldRef): string => `${f.metricCode}:${f.basis}`;

// filters 引用到的 CTE 之間用 INNER JOIN（缺資料的 symbol 整列排除）；只在 columns 出現、
// 沒被拿來 filter 的 CTE 用 LEFT JOIN（缺資料時該欄位是 null，symbol 仍保留）。filters 是
// 空陣列時沒有「driving」的 CTE 可以當基準，改用 columns 引用到的 CTE 的 symbol 聯集
// （UNION）當基準——理由跟舊架構同一段說明一致：CTE 一多，鏈式 FULL OUTER JOIN 的 join
// 條件會不正確，UNION 出一份 symbol 清單再 LEFT JOIN 回去每個 CTE 才是對的。
const buildFromClause = (filterCteRefs: CteRef[], columnOnlyCteRefs: CteRef[]): { extraCte: Prisma.Sql | null; fromSql: Prisma.Sql; symbolExpr: Prisma.Sql } => {
  if (filterCteRefs.length > 0) {
    const [first, ...rest] = filterCteRefs;
    const firstAlias = Prisma.raw(first!.alias);
    const parts: Prisma.Sql[] = [Prisma.sql`FROM ${firstAlias}`];
    for (const t of rest) {
      const alias = Prisma.raw(t.alias);
      parts.push(Prisma.sql`INNER JOIN ${alias} ON ${alias}.${q('symbol')} = ${firstAlias}.${q('symbol')}`);
    }
    for (const t of columnOnlyCteRefs) {
      const alias = Prisma.raw(t.alias);
      parts.push(Prisma.sql`LEFT JOIN ${alias} ON ${alias}.${q('symbol')} = ${firstAlias}.${q('symbol')}`);
    }
    return { extraCte: null, fromSql: Prisma.join(parts, ' '), symbolExpr: Prisma.sql`${firstAlias}.${q('symbol')}` };
  }

  if (columnOnlyCteRefs.length === 0) {
    throw new Error('buildFromClause: filters 跟 columns 都是空的，service.ts 應該在呼叫前就擋掉這個情況。');
  }
  if (columnOnlyCteRefs.length === 1) {
    const alias = Prisma.raw(columnOnlyCteRefs[0]!.alias);
    return { extraCte: null, fromSql: Prisma.sql`FROM ${alias}`, symbolExpr: Prisma.sql`${alias}.${q('symbol')}` };
  }

  const unionParts = columnOnlyCteRefs.map((t) => Prisma.sql`SELECT ${q('symbol')} FROM ${Prisma.raw(t.alias)}`);
  const allSymbolsCte = Prisma.sql`all_symbols AS (${Prisma.join(unionParts, ' UNION ')})`;
  const joinParts: Prisma.Sql[] = [Prisma.sql`FROM all_symbols`];
  for (const t of columnOnlyCteRefs) {
    const alias = Prisma.raw(t.alias);
    joinParts.push(Prisma.sql`LEFT JOIN ${alias} ON ${alias}.${q('symbol')} = all_symbols.${q('symbol')}`);
  }
  return { extraCte: allSymbolsCte, fromSql: Prisma.join(joinParts, ' '), symbolExpr: Prisma.sql`all_symbols.${q('symbol')}` };
};

export interface IndexedField extends FieldRef {
  index: number;
}

// 每個 field 選 value + knowledge_date 兩欄，用 index 當別名尾碼（v0/k0、v1/k1...），避免
// 同一個 (metricCode,basis) 出現在多個 field index 時互相覆蓋，parseRow 再用同一組 index
// 讀回來。asOfDate 統一用 knowledge_date（不像舊架構要依「季報型/每日型」分別組年季字串或
// 日期字串），單一欄位，不需要分支。
const buildSelectColumnsSql = (fields: IndexedField[], cteRefs: Map<string, CteRef>): Prisma.Sql[] =>
  fields.map((f) => {
    const alias = Prisma.raw(cteRefs.get(cteKeyFor(f))!.alias);
    return Prisma.join(
      [Prisma.sql`${alias}.${q('value')} AS ${Prisma.raw(`v${f.index}`)}`, Prisma.sql`${alias}.${q('knowledge_date')} AS ${Prisma.raw(`k${f.index}`)}`],
      ', '
    );
  });

export interface FilterCondition extends FieldRef {
  min: number | null;
  max: number | null;
  exclude: boolean;
}

// exclude=false：保留落在 [min, max] 內的值，null 一律排除。
// exclude=true：保留落在 [min, max] 外的值，null 一律排除；min/max 都沒給時「外面」沒有邊界
// 可言，篩掉全部——沿用舊架構同一條規則（跟 bff-ts 對過的既定行為，這次重建不改語意）。
const buildFilterCondition = (condition: FilterCondition, cteRefs: Map<string, CteRef>): Prisma.Sql => {
  const alias = Prisma.raw(cteRefs.get(cteKeyFor(condition))!.alias);
  const col = Prisma.sql`${alias}.${q('value')}`;

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

export interface SortSpec {
  /** "symbol" 或 columns 裡其中一個 field 字串——service.ts 已經驗證過存在，這裡直接信任。 */
  field: string;
  order: 'asc' | 'desc';
}

export const buildScreenerSql = (filters: FilterCondition[], columns: FieldRef[], page: number, pageSize: number, sort: SortSpec | null): Prisma.Sql => {
  const filterCteRefs = dedupCtes(filters);
  const columnCteRefs = dedupCtes(columns);
  const columnOnlyCteRefs = [...columnCteRefs.values()].filter((t) => !filterCteRefs.has(`${t.metricCode}:${t.basis}`));
  const allCteRefs = new Map([...filterCteRefs, ...columnCteRefs]);

  const ctes = [...allCteRefs.values()].map(buildCte);
  const { extraCte, fromSql, symbolExpr } = buildFromClause([...filterCteRefs.values()], columnOnlyCteRefs);
  const allCtes = extraCte ? [...ctes, extraCte] : ctes;

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  const selectCols = buildSelectColumnsSql(indexedColumns, allCteRefs);
  const selectList = [Prisma.sql`${symbolExpr} AS symbol`, ...selectCols, Prisma.sql`COUNT(*) OVER() AS total_count`];

  const whereConditions = filters.map((f) => buildFilterCondition(f, allCteRefs));
  const whereSql = whereConditions.length > 0 ? Prisma.join(whereConditions, ' AND ') : Prisma.sql`TRUE`;

  const offset = (page - 1) * pageSize;

  const orderByColumn =
    !sort || sort.field === 'symbol'
      ? Prisma.raw('symbol')
      : (() => {
          const index = indexedColumns.find((c) => c.field === sort.field)?.index;
          if (index === undefined) {
            throw new Error(`buildScreenerSql: sortField "${sort.field}" 不在 columns 裡，service.ts 應該在呼叫前就驗證過這件事。`);
          }
          return Prisma.raw(`v${index}`);
        })();
  const orderDirection = sort?.order === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
  // symbol 當第二排序鍵，排序目標本身有重複值時分頁才不會因為 Postgres 排序不保證穩定而錯位。
  const orderBySql = sort && sort.field !== 'symbol' ? Prisma.sql`${orderByColumn} ${orderDirection}, symbol ASC` : Prisma.sql`${orderByColumn} ${orderDirection}`;

  return Prisma.sql`
    WITH ${Prisma.join(allCtes, ', ')}
    SELECT ${Prisma.join(selectList, ', ')}
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY ${orderBySql}
    LIMIT ${pageSize} OFFSET ${offset}
  `;
};

// 排序欄位當作「唯一的 filter CTE」處理（INNER JOIN，null 值額外用 WHERE 排除——JOIN 本身
// 只保證這個 CTE 有一列，不保證 value 欄位不是 null），額外的 columns 一樣是 LEFT JOIN。
// 排序欄位本身永遠會出現在 values 裡（不管有沒有列進 columns）。
export const buildRankingSql = (rankedField: FieldRef, direction: 'asc' | 'desc', limit: number, columns: FieldRef[]): Prisma.Sql => {
  const combinedFields = [rankedField, ...columns];
  const filterCteRefs = dedupCtes([rankedField]);
  const columnCteRefs = dedupCtes(combinedFields);
  const columnOnlyCteRefs = [...columnCteRefs.values()].filter((t) => !filterCteRefs.has(`${t.metricCode}:${t.basis}`));
  const allCteRefs = new Map([...filterCteRefs, ...columnCteRefs]);

  const ctes = [...allCteRefs.values()].map(buildCte);
  const { fromSql } = buildFromClause([...filterCteRefs.values()], columnOnlyCteRefs);

  const rankedAlias = Prisma.raw(filterCteRefs.get(cteKeyFor(rankedField))!.alias);
  const rankedCol = Prisma.sql`${rankedAlias}.${q('value')}`;

  const indexedColumns: IndexedField[] = combinedFields.map((c, index) => ({ ...c, index }));
  const selectCols = buildSelectColumnsSql(indexedColumns, allCteRefs);
  const selectList = [Prisma.sql`${rankedAlias}.${q('symbol')} AS symbol`, ...selectCols];

  const directionSql = direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  return Prisma.sql`
    WITH ${Prisma.join(ctes, ', ')}
    SELECT ${Prisma.join(selectList, ', ')}
    ${fromSql}
    WHERE ${rankedCol} IS NOT NULL
    ORDER BY ${rankedCol} ${directionSql}
    LIMIT ${limit}
  `;
};

// GET 一批明確列出的 symbol 各自的欄位值——給「已經在畫面上的這幾檔股票，補一個新欄位」這種
// 情境用，不是篩選查詢。基準是呼叫端直接給的 symbol 清單本身（unnest 出一列一個），不是任何
// 一個 CTE 的內容——這樣每個要求的 symbol 都保證會出現在結果裡，即使所有欄位都沒有資料。
export const buildValuesSql = (symbols: string[], columns: FieldRef[]): Prisma.Sql => {
  const cteRefs = dedupCtes(columns);
  const ctes = [...cteRefs.values()].map(buildCte);

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  const selectCols = buildSelectColumnsSql(indexedColumns, cteRefs);
  const selectList = [Prisma.sql`req.symbol AS symbol`, ...selectCols];

  const joinParts: Prisma.Sql[] = [Prisma.sql`FROM unnest(${symbols}::text[]) AS req(symbol)`];
  for (const t of cteRefs.values()) {
    const alias = Prisma.raw(t.alias);
    joinParts.push(Prisma.sql`LEFT JOIN ${alias} ON ${alias}.${q('symbol')} = req.symbol`);
  }

  const withClause = ctes.length > 0 ? Prisma.sql`WITH ${Prisma.join(ctes, ', ')}` : Prisma.empty;

  return Prisma.sql`
    ${withClause}
    SELECT ${Prisma.join(selectList, ', ')}
    ${Prisma.join(joinParts, ' ')}
  `;
};
