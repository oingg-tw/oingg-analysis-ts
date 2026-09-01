import { Prisma } from '../../../generated/analysis-client';
import type { ResolvedField } from '@/domains/filter/metricTableRegistry';

// 核心查詢組裝邏輯——表名/欄名只會來自 metricTableRegistry.resolveField 解析出來的白名單
// （service.ts 已經驗證過），不會有任何使用者輸入字串直接拼進 SQL；filter 的 min/max 數值
// 一律透過 Prisma.sql 的參數化模板帶入，不是字串拼接。

export interface FieldRef {
  field: string; // 原始請求字串（"metricKey.fieldKey"），拿來當回應 values 的 key
  resolved: ResolvedField;
}

interface TableRef {
  tableName: string;
  alias: string;
  info: ResolvedField;
}

const q = (identifier: string): Prisma.Sql => Prisma.raw(`"${identifier}"`);

const dedupTables = (fields: ResolvedField[]): Map<string, TableRef> => {
  const map = new Map<string, TableRef>();
  for (const f of fields) {
    if (!map.has(f.tableName)) {
      map.set(f.tableName, { tableName: f.tableName, alias: `latest_${f.tableName}`, info: f });
    }
  }
  return map;
};

// 每張被引用到的表各自組一個 CTE，取「每個 symbol 最新一筆」：季報型要先篩合併報表、非子公司
// 那一列，再照 year/season 倒序排；每日型直接照日期欄位倒序排（欄位名稱因表而異，不能寫死
// tradeDate，見 metricTableRegistry.ts 的形狀判斷）。
const buildCte = (ref: TableRef): Prisma.Sql => {
  const table = q(ref.tableName);
  const alias = Prisma.raw(ref.alias);

  if (ref.info.shape === 'quarterly') {
    const { dataTypeColumn, subsidiaryCompanyIdColumn, yearColumn, seasonColumn } = ref.info.quarterlyFilterColumns!;
    return Prisma.sql`${alias} AS (
      SELECT DISTINCT ON (${q('symbol')}) *
      FROM ${table}
      WHERE ${q(dataTypeColumn)} = '2' AND ${q(subsidiaryCompanyIdColumn)} = ''
      ORDER BY ${q('symbol')}, ${q(yearColumn)} DESC, ${q(seasonColumn)} DESC
    )`;
  }

  return Prisma.sql`${alias} AS (
    SELECT DISTINCT ON (${q('symbol')}) *
    FROM ${table}
    ORDER BY ${q('symbol')}, ${q(ref.info.dateColumn!)} DESC
  )`;
};

// filters 引用到的表之間用 INNER JOIN（缺資料的 symbol 整列排除）；只在 columns 出現、沒被拿來
// filter 的表用 LEFT JOIN（缺資料時該欄位是 null，symbol 仍保留）。filters 是空陣列時沒有
//「driving」的表可以當基準，改用 columns 引用到的表的 symbol 聯集（UNION，不是逐一 FULL OUTER
// JOIN 串接——表一多，鏈式 FULL OUTER JOIN 的 join 條件會不正確，UNION 出一份 symbol 清單再
// LEFT JOIN 回去每張表才是對的）當基準。
const buildFromClause = (filterTableRefs: TableRef[], columnOnlyTableRefs: TableRef[]): { extraCte: Prisma.Sql | null; fromSql: Prisma.Sql; symbolExpr: Prisma.Sql } => {
  if (filterTableRefs.length > 0) {
    const [first, ...rest] = filterTableRefs;
    const firstAlias = Prisma.raw(first!.alias);
    const parts: Prisma.Sql[] = [Prisma.sql`FROM ${firstAlias}`];
    for (const t of rest) {
      const alias = Prisma.raw(t.alias);
      parts.push(Prisma.sql`INNER JOIN ${alias} ON ${alias}.${q('symbol')} = ${firstAlias}.${q('symbol')}`);
    }
    for (const t of columnOnlyTableRefs) {
      const alias = Prisma.raw(t.alias);
      parts.push(Prisma.sql`LEFT JOIN ${alias} ON ${alias}.${q('symbol')} = ${firstAlias}.${q('symbol')}`);
    }
    return { extraCte: null, fromSql: Prisma.join(parts, ' '), symbolExpr: Prisma.sql`${firstAlias}.${q('symbol')}` };
  }

  if (columnOnlyTableRefs.length === 0) {
    throw new Error('buildFromClause: filters 跟 columns 都是空的，service.ts 應該在呼叫前就擋掉這個情況。');
  }
  if (columnOnlyTableRefs.length === 1) {
    const alias = Prisma.raw(columnOnlyTableRefs[0]!.alias);
    return { extraCte: null, fromSql: Prisma.sql`FROM ${alias}`, symbolExpr: Prisma.sql`${alias}.${q('symbol')}` };
  }

  const unionParts = columnOnlyTableRefs.map((t) => Prisma.sql`SELECT ${q('symbol')} FROM ${Prisma.raw(t.alias)}`);
  const allSymbolsCte = Prisma.sql`all_symbols AS (${Prisma.join(unionParts, ' UNION ')})`;
  const joinParts: Prisma.Sql[] = [Prisma.sql`FROM all_symbols`];
  for (const t of columnOnlyTableRefs) {
    const alias = Prisma.raw(t.alias);
    joinParts.push(Prisma.sql`LEFT JOIN ${alias} ON ${alias}.${q('symbol')} = all_symbols.${q('symbol')}`);
  }
  return { extraCte: allSymbolsCte, fromSql: Prisma.join(joinParts, ' '), symbolExpr: Prisma.sql`all_symbols.${q('symbol')}` };
};

interface IndexedField extends FieldRef {
  index: number;
}

// 季報型多選 year/season（組 asOfDate 用），每日型多選日期欄位；用 index 當別名尾碼
// （v0/y0/s0、v1/d1...），避免不同 field 剛好同名欄位互相覆蓋，parseRow 再用同一組 index 讀回來。
const buildSelectColumnsSql = (fields: IndexedField[], tableRefs: Map<string, TableRef>): Prisma.Sql[] =>
  fields.map((f) => {
    const alias = Prisma.raw(tableRefs.get(f.resolved.tableName)!.alias);
    const valueSql = Prisma.sql`${alias}.${q(f.resolved.valueColumn)} AS ${Prisma.raw(`v${f.index}`)}`;
    if (f.resolved.shape === 'quarterly') {
      const { yearColumn, seasonColumn } = f.resolved.quarterlyFilterColumns!;
      return Prisma.join([valueSql, Prisma.sql`${alias}.${q(yearColumn)} AS ${Prisma.raw(`y${f.index}`)}`, Prisma.sql`${alias}.${q(seasonColumn)} AS ${Prisma.raw(`s${f.index}`)}`], ', ');
    }
    return Prisma.join([valueSql, Prisma.sql`${alias}.${q(f.resolved.dateColumn!)} AS ${Prisma.raw(`d${f.index}`)}`], ', ');
  });

export interface FilterCondition extends FieldRef {
  min: number | null;
  max: number | null;
  exclude: boolean;
}

// exclude=false：保留落在 [min, max] 內的值，null 一律排除。
// exclude=true：保留落在 [min, max] 外的值，null 一律排除；min/max 都沒給時「外面」沒有邊界
// 可言，篩掉全部——這是 bff-ts 規格字面上唯一自洽的解讀（見 docs/plan 的說明，做完會回報跟他們對過）。
const buildFilterCondition = (condition: FilterCondition, tableRefs: Map<string, TableRef>): Prisma.Sql => {
  const alias = Prisma.raw(tableRefs.get(condition.resolved.tableName)!.alias);
  const col = Prisma.sql`${alias}.${q(condition.resolved.valueColumn)}`;

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

export const buildScreenerSql = (filters: FilterCondition[], columns: FieldRef[], page: number, pageSize: number): Prisma.Sql => {
  const filterTableRefs = dedupTables(filters.map((f) => f.resolved));
  const columnTableRefs = dedupTables(columns.map((c) => c.resolved));
  const columnOnlyTableRefs = [...columnTableRefs.values()].filter((t) => !filterTableRefs.has(t.tableName));
  const allTableRefs = new Map([...filterTableRefs, ...columnTableRefs]);

  const ctes = [...allTableRefs.values()].map(buildCte);
  const { extraCte, fromSql, symbolExpr } = buildFromClause([...filterTableRefs.values()], columnOnlyTableRefs);
  const allCtes = extraCte ? [...ctes, extraCte] : ctes;

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  const selectCols = buildSelectColumnsSql(indexedColumns, allTableRefs);
  const selectList = [Prisma.sql`${symbolExpr} AS symbol`, ...selectCols, Prisma.sql`COUNT(*) OVER() AS total_count`];

  const whereConditions = filters.map((f) => buildFilterCondition(f, allTableRefs));
  const whereSql = whereConditions.length > 0 ? Prisma.join(whereConditions, ' AND ') : Prisma.sql`TRUE`;

  const offset = (page - 1) * pageSize;

  return Prisma.sql`
    WITH ${Prisma.join(allCtes, ', ')}
    SELECT ${Prisma.join(selectList, ', ')}
    ${fromSql}
    WHERE ${whereSql}
    ORDER BY symbol
    LIMIT ${pageSize} OFFSET ${offset}
  `;
};

// 排序欄位當作「唯一的 filter 表」處理（INNER JOIN，null 值額外用 WHERE 排除——JOIN 本身只保證
// 這張表有一列，不保證這個欄位不是 null），額外的 columns 一樣是 LEFT JOIN。排序欄位本身永遠會
// 出現在 values 裡（不管有沒有列進 columns）——不然「依 ROE 排行」卻看不到 ROE 數值的回應沒有意義。
export const buildRankingSql = (rankedField: FieldRef, direction: 'asc' | 'desc', limit: number, columns: FieldRef[]): Prisma.Sql => {
  const combinedFields = [rankedField, ...columns];
  const filterTableRefs = dedupTables([rankedField.resolved]);
  const columnTableRefs = dedupTables(combinedFields.map((c) => c.resolved));
  const columnOnlyTableRefs = [...columnTableRefs.values()].filter((t) => !filterTableRefs.has(t.tableName));
  const allTableRefs = new Map([...filterTableRefs, ...columnTableRefs]);

  const ctes = [...allTableRefs.values()].map(buildCte);
  const { fromSql } = buildFromClause([...filterTableRefs.values()], columnOnlyTableRefs);

  const rankedAlias = Prisma.raw(filterTableRefs.get(rankedField.resolved.tableName)!.alias);
  const rankedCol = Prisma.sql`${rankedAlias}.${q(rankedField.resolved.valueColumn)}`;

  const indexedColumns: IndexedField[] = combinedFields.map((c, index) => ({ ...c, index }));
  const selectCols = buildSelectColumnsSql(indexedColumns, allTableRefs);
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

export { type IndexedField };
