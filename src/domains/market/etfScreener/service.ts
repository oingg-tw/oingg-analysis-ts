import sitcaExportPrisma from '@/adapters/prisma/sitcaExportClient';
import { NUMERIC_FIELDS, CATEGORICAL_FIELDS, resolveEtfField, type NumericFieldDefinition, type CategoricalFieldDefinition } from './fieldRegistry';
import { buildEtfScreenerSql, type FilterCondition, type ColumnRef, type SortSpec } from './queryBuilder';
import type { EtfFilterInput, EtfColumnInput, EtfScreenerResponse, EtfScreenerRow, EtfFilterCatalogResponse, EtfFilterFieldCatalogEntry } from './types';

export class EtfScreenerValidationError extends Error {}

const getLatestYearMonth = async (): Promise<string | null> => {
  const rows = await sitcaExportPrisma.$queryRaw<{ year_month: string | null }[]>`
    SELECT MAX(year_month) as year_month FROM "export"."etf_basic_info"
  `;
  return rows[0]?.year_month ?? null;
};

// filter 的形狀（min/max vs values）要跟欄位登記的 kind 一致，不接受「數字欄位給 values」
// 或「類別欄位給 min/max」這種形狀不對的請求——這裡當成請求格式錯誤直接擋掉，不猜測意圖。
const resolveFilterCondition = (input: EtfFilterInput): FilterCondition => {
  const definition = resolveEtfField(input.field);
  if (!definition) {
    throw new EtfScreenerValidationError(`"${input.field}" 不是 GET /etf-screener/filters 列出的欄位。`);
  }

  if (definition.kind === 'numeric') {
    if (!('min' in input) || !('max' in input)) {
      throw new EtfScreenerValidationError(`"${input.field}" 是數字欄位，filter 要給 min/max，不是 values。`);
    }
    return { kind: 'numeric', definition, min: input.min, max: input.max, exclude: input.exclude ?? false };
  }

  if (!('values' in input) || !Array.isArray(input.values)) {
    throw new EtfScreenerValidationError(`"${input.field}" 是類別欄位，filter 要給 values 陣列，不是 min/max。`);
  }
  if (definition.field === 'isActive') {
    const invalid = input.values.filter((v) => v !== 'true' && v !== 'false');
    if (invalid.length > 0) {
      throw new EtfScreenerValidationError(`isActive 的 values 只能是 "true"/"false" 字串，收到不合法的值：${invalid.join(', ')}`);
    }
  }
  return { kind: 'categorical', definition, values: input.values };
};

const resolveColumn = (input: EtfColumnInput): ColumnRef => {
  const definition = resolveEtfField(input.field);
  if (!definition) {
    throw new EtfScreenerValidationError(`"${input.field}" 不是 GET /etf-screener/filters 列出的欄位。`);
  }
  return { field: input.field, definition };
};

// 跟股票 screener 同一條規則：不給就照 symbol 排序（保證分頁穩定），排序目標要嘛是 symbol
// 要嘛要先出現在 columns 裡（不然回應看不到排序依據的數值，沒有意義）。
const resolveSort = (sortField: string | undefined, sortOrder: 'asc' | 'desc' | undefined, columns: ColumnRef[]): SortSpec | null => {
  if (!sortField) return null;
  if (!sortOrder) {
    throw new EtfScreenerValidationError('有給 sortField 就要一起給 sortOrder。');
  }
  if (sortField === 'symbol') return { field: 'symbol', order: sortOrder };
  if (!columns.some((c) => c.field === sortField)) {
    throw new EtfScreenerValidationError(`sortField "${sortField}" 要嘛是 "symbol"，要嘛要先出現在 columns 裡才能排序。`);
  }
  return { field: sortField, order: sortOrder };
};

const parseValue = (raw: unknown, definition: NumericFieldDefinition | CategoricalFieldDefinition): number | string | boolean | null => {
  if (raw === null || raw === undefined) return null;
  if (definition.kind === 'numeric') return Number(raw);
  if (definition.field === 'isActive') return Boolean(raw);
  return String(raw);
};

export const runEtfScreener = async (request: {
  filters: EtfFilterInput[];
  columns: EtfColumnInput[];
  page: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<EtfScreenerResponse> => {
  const { filters: filterInputs, columns: columnInputs, page, pageSize } = request;

  const filters = filterInputs.map(resolveFilterCondition);
  const columns = columnInputs.map(resolveColumn);
  const sort = resolveSort(request.sortField, request.sortOrder, columns);

  if (filters.length === 0 && columns.length === 0) {
    throw new EtfScreenerValidationError('filters 跟 columns 至少要提供一個。');
  }

  const yearMonth = await getLatestYearMonth();
  if (!yearMonth) {
    return { count: 0, page, pageSize, totalPages: 0, results: [] };
  }

  const sql = buildEtfScreenerSql(yearMonth, filters, columns, page, pageSize, sort);
  const rows = await sitcaExportPrisma.$queryRaw<Record<string, unknown>[]>(sql);

  const results: EtfScreenerRow[] = rows.map((row) => {
    const values: Record<string, number | string | boolean | null> = {};
    for (const col of columns) {
      values[col.field] = parseValue(row[col.field], col.definition);
    }
    return {
      symbol: row.symbol as string,
      fundName: (row.fundName as string | null) ?? null,
      shortName: (row.shortName as string | null) ?? null,
      companyName: (row.companyName as string | null) ?? null,
      category: (row.category as string | null) ?? null,
      values,
    };
  });

  const count = rows.length > 0 ? Number(rows[0]!.total_count) : 0;
  return { count, page, pageSize, totalPages: count === 0 ? 0 : Math.ceil(count / pageSize), results };
};

// 給前端動態畫篩選 UI 用——2026-09-02 應使用者要求新增，跟 GET /filters（股票那邊）同一種
// 精神。數字欄位沒有 values；類別欄位裡 market/isActive 選項固定已知，assetClass 現查
// distinct 值（不寫死，之後 sitca-ts 分類異動會直接反映，不用改程式碼）。
export const getEtfFilterCatalog = async (): Promise<EtfFilterCatalogResponse> => {
  const fields: EtfFilterFieldCatalogEntry[] = Object.values(NUMERIC_FIELDS).map((def) => ({ field: def.field, label: def.label, kind: 'numeric' as const }));

  for (const def of Object.values(CATEGORICAL_FIELDS)) {
    if (def.staticValues) {
      fields.push({ field: def.field, label: def.label, kind: 'categorical', values: def.staticValues });
      continue;
    }
    const rows = await sitcaExportPrisma.$queryRaw<{ asset_class: string | null }[]>`
      SELECT DISTINCT substring(category from 'ETF_(.+)ETF') as asset_class
      FROM "export"."etf_basic_info"
      WHERE category ~ 'ETF_.+ETF$'
      ORDER BY 1
    `;
    fields.push({ field: def.field, label: def.label, kind: 'categorical', values: rows.map((r) => r.asset_class).filter((v): v is string => v !== null) });
  }

  return { fields };
};
