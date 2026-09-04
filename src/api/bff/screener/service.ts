import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolveField } from '@/api/bff/filter/metricTableRegistry';
import { formatRocYearSeasonAsOfDate } from '@/shared/rocQuarter';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import { buildScreenerSql, buildRankingSql, buildValuesSql, type FieldRef, type FilterCondition, type IndexedField, type SortSpec } from './queryBuilder';
import type { ScreenerColumnInput, ScreenerFilterInput, ScreenerResponse, ScreenerRankingResponse, ScreenerRow, ScreenerValue } from './types';

export class ScreenerValidationError extends Error {}

const resolveFieldOrThrow = (field: string): FieldRef => {
  const [metricKey, fieldKey] = field.split('.');
  if (!metricKey || !fieldKey) {
    throw new ScreenerValidationError(`"${field}" 格式錯誤，field 要是 "metricKey.fieldKey" 這種格式（例如 "roe.roeQuarterlyPct"）。`);
  }
  const resolved = resolveField(metricKey, fieldKey);
  if (!resolved) {
    throw new ScreenerValidationError(`"${field}" 不是 /filters 有列出的欄位，查不到對應的資料表。`);
  }
  return { field, resolved };
};

// $queryRaw 對 Decimal/Int 欄位可能回傳 Decimal 物件、字串、或原生 number，Number() 三種都能吃；
// 日期欄位（Date object 或字串）統一切成 YYYY-MM-DD。companyName 先留空字串，parseRows 本身
// 不查名稱（查名稱要另外打 twse/tpex，不是同一個資料庫查得到的東西）——由 attachCompanyNames
// 事後批次補上，兩件事分開做，parseRows 保持單純同步轉換。
const parseRows = (rows: Record<string, unknown>[], fields: IndexedField[]): Omit<ScreenerRow, 'companyName'>[] =>
  rows.map((row) => {
    const values: Record<string, ScreenerValue> = {};
    for (const f of fields) {
      const rawValue = row[`v${f.index}`];
      const value = rawValue !== null && rawValue !== undefined ? Number(rawValue) : null;

      let asOfDate: string | null = null;
      if (f.resolved.shape === 'quarterly') {
        const year = row[`y${f.index}`];
        const season = row[`s${f.index}`];
        asOfDate = year !== null && year !== undefined ? formatRocYearSeasonAsOfDate(Number(year), Number(season)) : null;
      } else {
        const date = row[`d${f.index}`];
        asOfDate = date ? (date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10)) : null;
      }
      values[f.field] = { value, asOfDate };
    }
    return { symbol: row.symbol as string, values };
  });

// 2026-09-01 應使用者要求新增——這一頁結果實際出現的 symbol 才查，不是全市場，跟排序公司名稱
// 撞到的跨資料庫限制無關（那個是要排序全部資料再分頁，這裡只是幫已經決定好的這幾筆補顯示用
// 欄位）。查無資料的 symbol（理論上不該發生，filter/screener 出來的 symbol 一定是真公司）
// companyName 是 null，不拋錯。
const attachCompanyNames = async (rows: Omit<ScreenerRow, 'companyName'>[]): Promise<ScreenerRow[]> => {
  const names = await getCompanyNamesForSymbols(rows.map((row) => row.symbol));
  return rows.map((row) => ({ ...row, companyName: names.get(row.symbol) ?? null }));
};

// sortField 只接受 "symbol" 或已經列在 columns 裡的 field——2026-09-01 應 bff-ts 要求新增。
// 不支援排公司名稱：company_profile 在 twse/tpex，是跟 analysis DB 完全獨立的另一個 Postgres
// 專案，screener 的查詢引擎沒有跨資料庫 JOIN 的機制，勉強做（例如把兩千多筆 symbol/name
// 塞成查詢參數）划不來，這個功能範圍先不做。
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

export const runScreener = async (request: {
  filters: ScreenerFilterInput[];
  columns: ScreenerColumnInput[];
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<ScreenerResponse> => {
  const { filters: filterInputs, columns: columnInputs, page, pageSize } = request;

  const filters: FilterCondition[] = filterInputs.map((f) => ({ ...resolveFieldOrThrow(f.field), min: f.min, max: f.max, exclude: f.exclude ?? false }));
  const columns: FieldRef[] = columnInputs.map((c) => resolveFieldOrThrow(c.field));
  const sort = resolveSort(request.sortField, request.sortOrder, columns);

  if (filters.length === 0 && columns.length === 0) {
    throw new ScreenerValidationError('filters 跟 columns 至少要提供一個。');
  }

  const sql = buildScreenerSql(filters, columns, page, pageSize, sort);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  const results = await attachCompanyNames(parseRows(rows, indexedColumns));
  const count = rows.length > 0 ? Number(rows[0]!.total_count) : 0;

  return { count, page, pageSize, totalPages: count === 0 ? 0 : Math.ceil(count / pageSize), results };
};

export const runScreenerRanking = async (request: { field: string; direction: 'asc' | 'desc'; limit: number; columns: string[] }): Promise<ScreenerRankingResponse> => {
  const rankedField = resolveFieldOrThrow(request.field);
  const columns = request.columns.map((field) => resolveFieldOrThrow(field));

  const sql = buildRankingSql(rankedField, request.direction, request.limit, columns);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const combinedFields: IndexedField[] = [rankedField, ...columns].map((c, index) => ({ ...c, index }));
  return { results: await attachCompanyNames(parseRows(rows, combinedFields)) };
};

// 給「已經在畫面上的這幾檔股票，補一個新欄位」用，不是篩選查詢——每個要求的 symbol 都保證
// 出現在 results 裡，查不到資料的欄位是 null，不會因為沒資料整個 symbol 被拿掉（跟 GET
// /stocks/prices 對查無資料的 symbol 是「直接不出現」不一樣，這裡的呼叫端已經知道這些 symbol
// 存在，缺資料要看得到，不是被靜默排除）。
export const runScreenerValues = async (request: { symbols: string[]; columns: ScreenerColumnInput[] }): Promise<{ results: ScreenerRow[] }> => {
  const symbols = [...new Set(request.symbols)];
  const columns = request.columns.map((c) => resolveFieldOrThrow(c.field));

  if (symbols.length === 0) return { results: [] };

  const sql = buildValuesSql(symbols, columns);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  return { results: await attachCompanyNames(parseRows(rows, indexedColumns)) };
};
