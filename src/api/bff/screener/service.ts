import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import { isValidSecuritiesSectorCode, listCompaniesBySectorCodes } from '@/shared/sourceData/securitiesIndustry';
import { resolveFieldOrThrow, ScreenerValidationError, type FieldRef } from './fieldResolver';
import { buildScreenerSql, buildRankingSql, buildValuesSql, type FilterCondition, type IndexedField, type SortSpec } from './queryBuilder';
import type { ScreenerColumnInput, ScreenerFilterInput, ScreenerResponse, ScreenerRankingResponse, ScreenerRow, ScreenerValue, ScreenerNullReason } from './types';

export { ScreenerValidationError };

// $queryRaw 對 Decimal 欄位可能回傳 Decimal 物件、字串、或原生 number，Number() 三種都能吃；
// knowledge_date 統一切成 YYYY-MM-DD。companyName 先留空，parseRows 本身不查名稱（查名稱要
// 另外打 twse/tpex，不是同一個資料庫查得到的東西）——由 attachCompanyNames 事後批次補上，
// 兩件事分開做，parseRows 保持單純同步轉換。
// 2026-09-13 補上 nullReason（見 queryBuilder.ts buildSelectColumnsSql 的說明）——這一列
// 完全查無資料時（symbol 從沒被算過這支指標）n{index} 也會是 undefined/null，跟「算過但
// value 為 null」在 SQL 層面無法區分（LEFT JOIN 到的整列都是 null），一律回傳 null，
// 呼叫端要精確分辨兩者請改查 GET /companies/metric-history。
const parseRows = (rows: Record<string, unknown>[], fields: IndexedField[]): Omit<ScreenerRow, 'companyName'>[] =>
  rows.map((row) => {
    const values: Record<string, ScreenerValue> = {};
    for (const f of fields) {
      const rawValue = row[`v${f.index}`];
      const value = rawValue !== null && rawValue !== undefined ? Number(rawValue) : null;
      const date = row[`k${f.index}`];
      const knowledgeDate = date ? (date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10)) : null;
      const nullReason = (row[`n${f.index}`] as ScreenerNullReason | null | undefined) ?? null;
      values[f.field] = { value, knowledgeDate, nullReason };
    }
    return { symbol: row.symbol as string, values };
  });

// 這一頁結果實際出現的 symbol 才查，不是全市場，跟排序公司名稱撞到的跨資料庫排序限制無關
// （那個是要排序全部資料再分頁，這裡只是幫已經決定好的這幾筆補顯示用欄位）。查無資料的
// symbol（理論上不該發生，filter/screener 出來的 symbol 一定是真公司）companyName 是 null。
const attachCompanyNames = async (rows: Omit<ScreenerRow, 'companyName'>[]): Promise<ScreenerRow[]> => {
  const names = await getCompanyNamesForSymbols(rows.map((row) => row.symbol));
  return rows.map((row) => ({ ...row, companyName: names.get(row.symbol) ?? null }));
};

// sortField 只接受 "symbol" 或已經列在 columns 裡的 field。不支援排公司名稱：company_profile
// 在 twse/tpex，是跟 analysis DB 完全獨立的另一個 Postgres 專案，screener 的查詢引擎沒有
// 跨資料庫 JOIN 的機制。
const resolveSort = (sortField: string | undefined, sortOrder: 'asc' | 'desc' | undefined, columns: FieldRef[]): SortSpec | null => {
  if (!sortField) return null;
  if (!sortOrder) {
    throw new ScreenerValidationError('有給 sortField 就要一起給 sortOrder。');
  }
  if (sortField === 'symbol') return { field: 'symbol', order: sortOrder };
  if (!columns.some((c) => c.field === sortField)) {
    throw new ScreenerValidationError(`sortField "${sortField}" 要嘛是 "symbol"，要嘛要先出現在 columns 裡才能排序。`);
  }
  return { field: sortField, order: sortOrder };
};

// 2026-09-11 新增：類股篩選（sectorCodes）resolve 成候選 symbol 陣列——用的是證交所類股
// 分類（twse-ts/tpex-ts company_profile.industry，例如「24」半導體業），不是財政部稅籍
// 分類，這是投資人習慣、可以對應「半導體業」「電子零組件業」這類熟悉類股名稱的那一套。任一
// 代碼不合法就直接 400，不是靜默忽略打錯的代碼（比照 fieldResolver 對未知 metricCode 一律
// 400 的既有慣例）。sectorCodes 沒給或空陣列回傳 null，buildScreenerSql/buildRankingSql
// 收到 null 就不多加這個 WHERE 條件，行為完全不變。
const resolveSectorCandidateSymbols = async (sectorCodes: string[] | undefined): Promise<string[] | null> => {
  if (!sectorCodes || sectorCodes.length === 0) return null;
  for (const code of sectorCodes) {
    if (!isValidSecuritiesSectorCode(code)) {
      throw new ScreenerValidationError(`sectorCodes 裡的 "${code}" 不是合法的證券類股代碼，請查 GET /industries/securities-sectors 取得合法代碼。`);
    }
  }
  return [...(await listCompaniesBySectorCodes(sectorCodes))];
};

export const runScreener = async (request: {
  filters: ScreenerFilterInput[];
  columns: ScreenerColumnInput[];
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  sectorCodes?: string[];
}): Promise<ScreenerResponse> => {
  const { filters: filterInputs, columns: columnInputs, page, pageSize } = request;

  const filters: FilterCondition[] = filterInputs.map((f) => ({ ...resolveFieldOrThrow(f.field), min: f.min, max: f.max, exclude: f.exclude ?? false }));
  const columns: FieldRef[] = columnInputs.map((c) => resolveFieldOrThrow(c.field));
  const sort = resolveSort(request.sortField, request.sortOrder, columns);
  const candidateSymbols = await resolveSectorCandidateSymbols(request.sectorCodes);

  if (filters.length === 0 && columns.length === 0) {
    throw new ScreenerValidationError('filters 跟 columns 至少要提供一個。');
  }

  const sql = buildScreenerSql(filters, columns, page, pageSize, sort, candidateSymbols);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  const results = await attachCompanyNames(parseRows(rows, indexedColumns));
  const count = rows.length > 0 ? Number(rows[0]!.total_count) : 0;

  return { count, page, pageSize, totalPages: count === 0 ? 0 : Math.ceil(count / pageSize), results };
};

export const runScreenerRanking = async (request: {
  field: string;
  direction: 'asc' | 'desc';
  limit: number;
  columns: string[];
  sectorCodes?: string[];
}): Promise<ScreenerRankingResponse> => {
  const rankedField = resolveFieldOrThrow(request.field);
  const columns = request.columns.map((field) => resolveFieldOrThrow(field));
  const candidateSymbols = await resolveSectorCandidateSymbols(request.sectorCodes);

  const sql = buildRankingSql(rankedField, request.direction, request.limit, columns, candidateSymbols);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const combinedFields: IndexedField[] = [rankedField, ...columns].map((c, index) => ({ ...c, index }));
  return { results: await attachCompanyNames(parseRows(rows, combinedFields)) };
};

// 給「已經在畫面上的這幾檔股票，補一個新欄位」用，不是篩選查詢——每個要求的 symbol 都保證
// 出現在 results 裡，查不到資料的欄位是 null，不會因為沒資料整個 symbol 被拿掉。
export const runScreenerValues = async (request: { symbols: string[]; columns: ScreenerColumnInput[] }): Promise<{ results: ScreenerRow[] }> => {
  const symbols = [...new Set(request.symbols)];
  const columns = request.columns.map((c) => resolveFieldOrThrow(c.field));

  if (symbols.length === 0) return { results: [] };

  const sql = buildValuesSql(symbols, columns);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  return { results: await attachCompanyNames(parseRows(rows, indexedColumns)) };
};
