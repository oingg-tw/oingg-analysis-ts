import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolveField } from '@/domains/filter/metricTableRegistry';
import { formatRocYearSeasonAsOfDate } from '@/shared/rocQuarter';
import { buildScreenerSql, buildRankingSql, type FieldRef, type FilterCondition, type IndexedField } from './queryBuilder';
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
// 日期欄位（Date object 或字串）統一切成 YYYY-MM-DD。
const parseRows = (rows: Record<string, unknown>[], fields: IndexedField[]): ScreenerRow[] =>
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

export const runScreener = async (request: { filters: ScreenerFilterInput[]; columns: ScreenerColumnInput[]; page: number; pageSize: number }): Promise<ScreenerResponse> => {
  const { filters: filterInputs, columns: columnInputs, page, pageSize } = request;

  const filters: FilterCondition[] = filterInputs.map((f) => ({ ...resolveFieldOrThrow(f.field), min: f.min, max: f.max, exclude: f.exclude ?? false }));
  const columns: FieldRef[] = columnInputs.map((c) => resolveFieldOrThrow(c.field));

  if (filters.length === 0 && columns.length === 0) {
    throw new ScreenerValidationError('filters 跟 columns 至少要提供一個。');
  }

  const sql = buildScreenerSql(filters, columns, page, pageSize);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const indexedColumns: IndexedField[] = columns.map((c, index) => ({ ...c, index }));
  const results = parseRows(rows, indexedColumns);
  const count = rows.length > 0 ? Number(rows[0]!.total_count) : 0;

  return { count, page, pageSize, totalPages: count === 0 ? 0 : Math.ceil(count / pageSize), results };
};

export const runScreenerRanking = async (request: { field: string; direction: 'asc' | 'desc'; limit: number; columns: string[] }): Promise<ScreenerRankingResponse> => {
  const rankedField = resolveFieldOrThrow(request.field);
  const columns = request.columns.map((field) => resolveFieldOrThrow(field));

  const sql = buildRankingSql(rankedField, request.direction, request.limit, columns);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const combinedFields: IndexedField[] = [rankedField, ...columns].map((c, index) => ({ ...c, index }));
  return { results: parseRows(rows, combinedFields) };
};
