import { Prisma } from '#generated/analysis-client';
import type { FieldRef } from './fieldResolver';

// 核心查詢組裝邏輯——2026-09-08 重建，改成對 pitMetrics 共用的 metric_values 表查詢，取代
// 已刪除的 metricTableRegistry 那套「一指標一表」解析機制。metricCode/四個 basis 相關欄位
// 都經過 fieldResolver.resolveFieldOrThrow 驗證過，只會是 metricDefinitionRegistry 裡真實
// 存在的組合（不是使用者可以任意輸入字串直接拼進 SQL）；filter 的 min/max 數值一律透過
// Prisma.sql 的參數化模板帶入，不是字串拼接。
//
// 2026-09-08 重建時的簡化：逐日型指標曾經跟季報型共用 metric_values，靠 fiscal_quarter
// sentinel=0 冒充季度、knowledge_date 當最終排序鍵。2026-09-09 拆表後（見
// abstract-crafting-journal.md）逐日型指標搬到獨立的 metric_daily_cadence_values，
// buildCte() 依 CteRef.isDailyCadence 分流查詢兩張表其中一張，其餘函式（
// buildFromClause/buildSelectColumnsSql/buildFilterCondition/basisGroupKeyFor/
// cteAliasFor）只在別名/欄位層級操作，完全不需要知道背後是哪張表。

const DATA_TYPE = '2'; // 合併報表——跟 roe-history 等既有 pitMetrics 端點同一個慣例，不對外曝露
const SUBSIDIARY_COMPANY_ID = ''; // 母公司本身

const q = (identifier: string): Prisma.Sql => Prisma.raw(`"${identifier}"`);

interface CteRef {
  alias: string;
  metricCode: string;
  periodType: string;
  lookbackRange: string;
  samplingInterval: string;
  snapshotCadence: string;
  isDailyCadence: boolean;
}

const basisGroupKeyFor = (f: FieldRef): string => `${f.metricCode}:${f.periodType}:${f.lookbackRange}:${f.samplingInterval}:${f.snapshotCadence}`;

// 每個唯一的 (metricCode, 四個 basis 相關欄位) 組合各自一個 CTE，不是每個 field 各自一個——
// 同一組合出現在 filters 又出現在 columns 時（例如同時拿 roe.TTM 篩選又要顯示），只查一次。
// alias 必須是這個組合的純函式（不能用陣列索引），因為 buildScreenerSql/buildRankingSql
// 會分別對 filters 跟 columns 各自呼叫一次 dedupCtes 再合併——如果 alias 依呼叫當下的陣列
// 位置而定，同一個組合在兩次呼叫裡可能被指派不同 alias，合併 Map 時後面的呼叫會覆蓋前面
// 算出來的 alias，但 buildFromClause 用的是前面那次呼叫的結果，兩邊對不上會產生「JOIN 到
// 一個沒有被定義過的 CTE alias」的壞掉 SQL。
const cteAliasFor = (key: string): string => `latest_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;

const dedupCtes = (fields: FieldRef[]): Map<string, CteRef> => {
  const map = new Map<string, CteRef>();
  for (const f of fields) {
    const key = basisGroupKeyFor(f);
    if (!map.has(key)) {
      map.set(key, { alias: cteAliasFor(key), metricCode: f.metricCode, periodType: f.periodType, lookbackRange: f.lookbackRange, samplingInterval: f.samplingInterval, snapshotCadence: f.snapshotCadence, isDailyCadence: f.isDailyCadence });
    }
  }
  return map;
};

// 2026-09-09：逐日型指標（beta/exchangePeRatio 等）已經從 metric_values 拆到獨立的
// metric_daily_cadence_values（見 abstract-crafting-journal.md 的拆表決策）——這是全
// queryBuilder.ts 唯一直接寫死表名、組 SQL 的地方，改成依 CteRef.isDailyCadence 決定
// 查哪張表：metric_values 縮回純季報型形狀（period_type 是唯一的 basis 相關欄位，
// lookback_range/sampling_interval/snapshot_cadence 這三欄已經不存在），排序鍵不變；
// metric_daily_cadence_values 沒有 period_type/fiscal_year/fiscal_quarter，排序改用
// trade_date（真正的自然鍵）+ knowledge_date 當 tiebreaker。
const buildCte = (ref: CteRef): Prisma.Sql => {
  const alias = Prisma.raw(ref.alias);
  if (ref.isDailyCadence) {
    return Prisma.sql`${alias} AS (
      SELECT DISTINCT ON (${q('symbol')}) *
      FROM ${q('metric_daily_cadence_values')}
      WHERE ${q('metric_code')} = ${ref.metricCode}
        AND ${q('lookback_range')} = ${ref.lookbackRange}
        AND ${q('sampling_interval')} = ${ref.samplingInterval}
        AND ${q('snapshot_cadence')} = ${ref.snapshotCadence}
        AND ${q('data_type')} = ${DATA_TYPE} AND ${q('subsidiary_company_id')} = ${SUBSIDIARY_COMPANY_ID}
      ORDER BY ${q('symbol')}, ${q('trade_date')} DESC, ${q('knowledge_date')} DESC
    )`;
  }
  return Prisma.sql`${alias} AS (
    SELECT DISTINCT ON (${q('symbol')}) *
    FROM ${q('metric_values')}
    WHERE ${q('metric_code')} = ${ref.metricCode}
      AND ${q('period_type')} = ${ref.periodType}
      AND ${q('data_type')} = ${DATA_TYPE} AND ${q('subsidiary_company_id')} = ${SUBSIDIARY_COMPANY_ID}
    ORDER BY ${q('symbol')}, ${q('fiscal_year')} DESC, ${q('fiscal_quarter')} DESC, ${q('knowledge_date')} DESC
  )`;
};

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

// 每個 field 選 value + knowledge_date + null_reason 三欄，用 index 當別名尾碼
// （v0/k0/n0、v1/k1/n1...），避免同一個組合出現在多個 field index 時互相覆蓋，parseRow
// 再用同一組 index 讀回來。knowledgeDate 統一讀 knowledge_date（不像舊架構要依
// 「季報型/每日型」分別組年季字串或日期字串），單一欄位，不需要分支。
// 2026-09-13 這個輸出欄位原本叫 asOfDate，改名 knowledgeDate——跟其餘 PIT 端點
// （metric-history 等）統一用語，也避免跟專案裡「asOfDate 當查詢輸入參數」的既有用法
// （getStockPriceAsOf 等）撞名混淆，見 service.ts 的完整說明。
// 2026-09-13 補上 null_reason——web-nuxt 回報徽章卡片（走 POST /screener/values）金融股
// 顯示籠統的「尚無資料」，跟歷年統計表（走 GET /companies/metric-history，本來就有
// nullReason）不一致，原因是這支查詢引擎的 SELECT 清單原本只挑 value/knowledge_date 兩欄。
// 三個 build*Sql（screener/ranking/values）都共用這支函式，一次補齊，不用分別改三份。
const buildSelectColumnsSql = (fields: IndexedField[], cteRefs: Map<string, CteRef>): Prisma.Sql[] =>
  fields.map((f) => {
    const alias = Prisma.raw(cteRefs.get(basisGroupKeyFor(f))!.alias);
    return Prisma.join(
      [
        Prisma.sql`${alias}.${q('value')} AS ${Prisma.raw(`v${f.index}`)}`,
        Prisma.sql`${alias}.${q('knowledge_date')} AS ${Prisma.raw(`k${f.index}`)}`,
        Prisma.sql`${alias}.${q('null_reason')} AS ${Prisma.raw(`n${f.index}`)}`,
      ],
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
  const alias = Prisma.raw(cteRefs.get(basisGroupKeyFor(condition))!.alias);
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

// candidateSymbols：2026-09-11 新增，類股篩選（sectorCodes）resolve 出來的候選公司
// 集合，null 代表沒有類股篩選、不多加這個條件（行為跟改動前完全一樣）。注入方式比照
// buildValuesSql 既有的 unnest($1::text[]) pattern，一樣是參數化模板，不是字串拼接。
export const buildScreenerSql = (
  filters: FilterCondition[],
  columns: FieldRef[],
  page: number,
  pageSize: number,
  sort: SortSpec | null,
  candidateSymbols: string[] | null = null
): Prisma.Sql => {
  const filterCteRefs = dedupCtes(filters);
  const columnCteRefs = dedupCtes(columns);
  const columnOnlyCteRefs = [...columnCteRefs.entries()].filter(([key]) => !filterCteRefs.has(key)).map(([, v]) => v);
  const allCteRefs = new Map([...filterCteRefs, ...columnCteRefs]);

  const ctes = [...allCteRefs.values()].map(buildCte);
  const { extraCte, fromSql, symbolExpr } = buildFromClause([...filterCteRefs.values()], columnOnlyCteRefs);
  const allCtes = extraCte ? [...ctes, extraCte] : ctes;

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  const selectCols = buildSelectColumnsSql(indexedColumns, allCteRefs);
  const selectList = [Prisma.sql`${symbolExpr} AS symbol`, ...selectCols, Prisma.sql`COUNT(*) OVER() AS total_count`];

  const whereConditions = filters.map((f) => buildFilterCondition(f, allCteRefs));
  if (candidateSymbols !== null) {
    whereConditions.push(Prisma.sql`${symbolExpr} = ANY(${candidateSymbols}::text[])`);
  }
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
export const buildRankingSql = (
  rankedField: FieldRef,
  direction: 'asc' | 'desc',
  limit: number,
  columns: FieldRef[],
  candidateSymbols: string[] | null = null
): Prisma.Sql => {
  const combinedFields = [rankedField, ...columns];
  const filterCteRefs = dedupCtes([rankedField]);
  const columnCteRefs = dedupCtes(combinedFields);
  const columnOnlyCteRefs = [...columnCteRefs.entries()].filter(([key]) => !filterCteRefs.has(key)).map(([, v]) => v);
  const allCteRefs = new Map([...filterCteRefs, ...columnCteRefs]);

  const ctes = [...allCteRefs.values()].map(buildCte);
  const { fromSql } = buildFromClause([...filterCteRefs.values()], columnOnlyCteRefs);

  const rankedAlias = Prisma.raw(filterCteRefs.get(basisGroupKeyFor(rankedField))!.alias);
  const rankedCol = Prisma.sql`${rankedAlias}.${q('value')}`;

  const indexedColumns: IndexedField[] = combinedFields.map((c, index) => ({ ...c, index }));
  const selectCols = buildSelectColumnsSql(indexedColumns, allCteRefs);
  const selectList = [Prisma.sql`${rankedAlias}.${q('symbol')} AS symbol`, ...selectCols];

  const directionSql = direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const whereConditions = [Prisma.sql`${rankedCol} IS NOT NULL`];
  if (candidateSymbols !== null) {
    whereConditions.push(Prisma.sql`${rankedAlias}.${q('symbol')} = ANY(${candidateSymbols}::text[])`);
  }

  return Prisma.sql`
    WITH ${Prisma.join(ctes, ', ')}
    SELECT ${Prisma.join(selectList, ', ')}
    ${fromSql}
    WHERE ${Prisma.join(whereConditions, ' AND ')}
    ORDER BY ${rankedCol} ${directionSql}
    LIMIT ${limit}
  `;
};

// 查單一公司在全市場某個欄位的排名——跟 buildRankingSql（取前 N 名清單）是互補的兩種查詢，
// 這支不是「抓全市場清單再自己數」，是用 RANK() window function 在同一次查詢裡對全市場
// 算好名次跟總數，最後只取目標 symbol 那一列。RANK()（不是 ROW_NUMBER()）讓並列數值拿到
// 同一個名次（例如兩家公司殖利率並列第 3，都回傳 rank=3，不會被迫拆成 3/4），跟業界排行榜
// 慣例一致。
export const buildCompanyRankSql = (symbol: string, field: FieldRef, direction: 'asc' | 'desc', candidateSymbols: string[] | null = null): Prisma.Sql => {
  const filterCteRefs = dedupCtes([field]);
  const ctes = [...filterCteRefs.values()].map(buildCte);
  const alias = Prisma.raw(filterCteRefs.get(basisGroupKeyFor(field))!.alias);
  const valueCol = Prisma.sql`${alias}.${q('value')}`;

  const directionSql = direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const whereConditions = [Prisma.sql`${valueCol} IS NOT NULL`];
  if (candidateSymbols !== null) {
    whereConditions.push(Prisma.sql`${alias}.${q('symbol')} = ANY(${candidateSymbols}::text[])`);
  }

  return Prisma.sql`
    WITH ${Prisma.join(ctes, ', ')},
    ranked AS (
      SELECT
        ${alias}.${q('symbol')} AS symbol,
        ${valueCol} AS value,
        RANK() OVER (ORDER BY ${valueCol} ${directionSql}) AS rank,
        COUNT(*) OVER() AS total_count
      FROM ${alias}
      WHERE ${Prisma.join(whereConditions, ' AND ')}
    )
    SELECT symbol, value, rank, total_count FROM ranked WHERE symbol = ${symbol}
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
