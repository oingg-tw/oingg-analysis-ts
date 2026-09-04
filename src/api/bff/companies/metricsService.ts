import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolveField } from '@/api/bff/filter/metricTableRegistry';
import { buildValuesSql, type FieldRef, type IndexedField } from '@/api/bff/screener/queryBuilder';
import { indicatorJobs, type IndicatorJob } from '@/api/batch/indicatorRegistry';
import { formatRocYearSeasonAsOfDate } from '@/shared/rocQuarter';
import type { CompanyMetricValue, CompanyMetricsResult } from './types';

export class CompanyMetricsValidationError extends Error {}

// indicatorJobs 的 name 就是 filterCatalog 的 metric.key（見 metricTableRegistry.ts 的
// buildState），可以直接拿來做 compute-on-miss 的查表依據，不用另外維護一份對照。
const jobsByMetricKey = new Map(indicatorJobs.map((job) => [job.name, job]));

export const resolveFieldOrThrow = (field: string): FieldRef => {
  const [metricKey, fieldKey] = field.split('.');
  if (!metricKey || !fieldKey) {
    throw new CompanyMetricsValidationError(`"${field}" 格式錯誤，field 要是 "metricKey.fieldKey" 這種格式（例如 "roe.roeQuarterlyPct"）。`);
  }
  const resolved = resolveField(metricKey, fieldKey);
  if (!resolved) {
    const hint =
      metricKey === 'equityRiskPremium' || metricKey === 'govBondYield10y'
        ? '——這是全市場單一值，不分公司，請改打 /macro/equity-risk-premium 或 /macro/gov-bond-yield-10y。'
        : metricKey === 'obv'
          ? '——obv 目前尚未支援單一公司查詢。'
          : '，可能是打錯 metricKey/fieldKey，先查 GET /filters 確認可用欄位。';
    throw new CompanyMetricsValidationError(`"${field}" 不是可查詢的欄位${hint}`);
  }
  return { field, resolved };
};

interface ParsedValue {
  value: number | null;
  asOfDate: string | null;
}

// 跟 screener/service.ts 的 parseRows 同一套轉換規則，這裡是單一 symbol 版本——查無資料時
// row 是 undefined（buildValuesSql 對這個 symbol 完全沒有任何一張表有資料的極端情況），
// 全部欄位視為 cache miss，不是拋錯。
const parseRow = (row: Record<string, unknown> | undefined, fields: IndexedField[]): Map<string, ParsedValue> => {
  const result = new Map<string, ParsedValue>();
  for (const f of fields) {
    if (!row) {
      result.set(f.field, { value: null, asOfDate: null });
      continue;
    }
    const rawValue = row[`v${f.index}`];
    const value = rawValue !== null && rawValue !== undefined ? Number(rawValue) : null;

    let asOfDate: string | null;
    if (f.resolved.shape === 'quarterly') {
      const year = row[`y${f.index}`];
      const season = row[`s${f.index}`];
      asOfDate = year !== null && year !== undefined ? formatRocYearSeasonAsOfDate(Number(year), Number(season)) : null;
    } else {
      const date = row[`d${f.index}`];
      asOfDate = date ? (date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10)) : null;
    }
    result.set(f.field, { value, asOfDate });
  }
  return result;
};

const queryValues = async (symbol: string, fields: FieldRef[]): Promise<Map<string, ParsedValue>> => {
  const indexedFields: IndexedField[] = fields.map((f, index) => ({ ...f, index }));
  const sql = buildValuesSql([symbol], fields);
  const rows = await analysisPrisma.$queryRaw<Record<string, unknown>[]>(sql);
  return parseRow(rows[0], indexedFields);
};

// api/bff 讀取優先：先讀 analysis 結果表，查不到（asOfDate === null）才委派給 api/batch
// 的現算+upsert 邏輯補算，取代原本 44 支「每支指標各自一個端點、每次都現算」的舊端點。
//
// cache miss 的判斷是 asOfDate === null，不是 value === null——欄位存在但 value 是 null
// 很可能是那季/那天資料本來就缺（例如權益為負、TTM 資料不齊），重算大機率還是 null；
// asOfDate === null 才代表這張表根本沒有這個 symbol 的任何一列，才是真的需要委派計算。
//
// 兩個請求同時對同一個 symbol+metricKey cache miss 會各自觸發一次重算、各自 upsert
// 一次——是重複運算但不是資料錯誤（兩邊算出來的值理論上一樣，upsert 以最新一次寫入為準），
// 這裡不做 in-process de-dup，範圍是單一 symbol 請求，重複機率不高，之後有需要再加。
export const runCompanyMetrics = async (symbol: string, fieldStrings: string[]): Promise<CompanyMetricsResult> => {
  const fields = fieldStrings.map(resolveFieldOrThrow);

  const before = await queryValues(symbol, fields);

  const missingMetricKeys = new Set(fields.filter((f) => before.get(f.field)!.asOfDate === null).map((f) => f.resolved.metricKey));
  const jobsToRun = [...missingMetricKeys]
    .map((key) => jobsByMetricKey.get(key))
    .filter((job): job is IndicatorJob => job !== undefined);

  const after = jobsToRun.length > 0 ? await Promise.all(jobsToRun.map((job) => job.run(symbol))).then(() => queryValues(symbol, fields)) : before;

  const values: Record<string, CompanyMetricValue> = {};
  for (const f of fields) {
    const beforeValue = before.get(f.field)!;
    const afterValue = after.get(f.field)!;
    const source: CompanyMetricValue['source'] = beforeValue.asOfDate !== null ? 'cache' : afterValue.asOfDate !== null ? 'computed' : 'unavailable';
    values[f.field] = { value: afterValue.value, asOfDate: afterValue.asOfDate, source };
  }

  return { symbol, values };
};
