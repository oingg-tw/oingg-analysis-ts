import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import type { FilterCategory, FilterMetric, FilterField, FilterFieldPeriod, FilterUnit } from './filterCatalog';

// 2026-09-05 起 filterCatalog.ts 的資料來源從手寫的巢狀陣列字面量改成這個 CSV——見
// filterCatalog.csv、scripts/exportFilterCatalogToCsv.ts（一次性遷移工具，也是之後需要
// 重新產生 CSV 範本時的備用工具）。動機：domainMetrics 預期會大量成長，屆時手寫巢狀 TS
// 物件字面量不好排序/篩選/批次修改，CSV 可以直接用 Excel/Google Sheets 打開管理。
//
// CSV 是「一列對應一個 FilterField」的攤平格式，category/metric 層級的欄位在同一個指標
// 底下的每一列重複（跟使用者實際在試算表操作的習慣一致，不做正規化多表設計）。跟
// filterCatalogCheck.ts 讀 schema.prisma 同一種模式：process.cwd() 而非
// import.meta.url/__dirname，理由見該檔案的說明（build 出來是 CommonJS，import.meta 在
// CommonJS 底下是編譯期錯誤）。
const csvPath = join(process.cwd(), 'src/api/bff/filter/filterCatalog.csv');

interface FilterCatalogCsvRow {
  categoryKey: string;
  categoryName: string;
  metricKey: string;
  metricName: string;
  metricPath: string;
  metricModelKey: string;
  metricDescription: string;
  metricSource: string;
  metricUnit: string;
  fieldKey: string;
  fieldName: string;
  fieldPeriod: string;
  fieldSort: string;
  fieldDescription: string;
  fieldSource: string;
  fieldUnit: string;
  fieldAliases: string;
}

const VALID_PERIODS = new Set<FilterFieldPeriod>(['quarterly', 'quarterlyAnnualized', 'ttm', 'snapshot', 'daily', 'weekly', 'monthly']);
const VALID_UNITS = new Set<FilterUnit>(['percent', 'currency', 'times', 'days', 'ratio', 'score']);

const orEmpty = (value: string): string | undefined => (value === '' ? undefined : value);

// 兩個地方都要驗證同一個 metric 底下每一列的 category/metric 層級欄位是不是完全一致——
// 攤平格式的代價是同一份資訊重複很多次，最容易犯的資料輸入錯誤就是「同一個 metricKey，
// 某一列的 metricName 手殘打錯/漏改」，這種情況要直接爆出來，不要讓兩個顯示不一致的名稱
// 悄悄地其中一個生效。
const assertConsistent = (rowIndex: number, metricKey: string, field: string, expected: string, actual: string): void => {
  if (expected !== actual) {
    throw new Error(
      `filterCatalog.csv 第 ${rowIndex + 2} 列（metricKey: "${metricKey}"）的 ${field} 是 "${actual}"，跟同一個 metric 前面的列（"${expected}"）對不起來——資料打架，通常是複製貼上漏改。`,
    );
  }
};

export const loadFilterCatalog = (): FilterCategory[] => {
  const csvText = readFileSync(csvPath, 'utf-8');
  const rows = parse(csvText, { columns: true, skip_empty_lines: true }) as FilterCatalogCsvRow[];

  const categoriesByKey = new Map<string, FilterCategory>();
  const metricsByKey = new Map<string, FilterMetric>();

  rows.forEach((row, rowIndex) => {
    if (!row.categoryKey || !row.metricKey || !row.fieldKey) {
      throw new Error(`filterCatalog.csv 第 ${rowIndex + 2} 列缺少必填欄位（categoryKey/metricKey/fieldKey 其中之一是空的）。`);
    }
    if (!VALID_PERIODS.has(row.fieldPeriod as FilterFieldPeriod)) {
      throw new Error(`filterCatalog.csv 第 ${rowIndex + 2} 列的 fieldPeriod "${row.fieldPeriod}" 不是合法值（${[...VALID_PERIODS].join('/')} 其中之一）。`);
    }
    const metricUnit = row.metricUnit as FilterUnit;
    if (!VALID_UNITS.has(metricUnit)) {
      throw new Error(`filterCatalog.csv 第 ${rowIndex + 2} 列的 metricUnit "${row.metricUnit}" 不是合法值（${[...VALID_UNITS].join('/')} 其中之一）。`);
    }
    const fieldUnitRaw = orEmpty(row.fieldUnit);
    if (fieldUnitRaw !== undefined && !VALID_UNITS.has(fieldUnitRaw as FilterUnit)) {
      throw new Error(`filterCatalog.csv 第 ${rowIndex + 2} 列的 fieldUnit "${row.fieldUnit}" 不是合法值（${[...VALID_UNITS].join('/')} 其中之一）。`);
    }

    let category = categoriesByKey.get(row.categoryKey);
    if (!category) {
      category = { key: row.categoryKey, name: row.categoryName, metrics: [] };
      categoriesByKey.set(row.categoryKey, category);
    } else {
      assertConsistent(rowIndex, row.metricKey, 'categoryName', category.name, row.categoryName);
    }

    let metric = metricsByKey.get(row.metricKey);
    if (!metric) {
      const metricModelKey = orEmpty(row.metricModelKey);
      const metricDescription = orEmpty(row.metricDescription);
      const metricSource = orEmpty(row.metricSource);
      metric = {
        key: row.metricKey,
        name: row.metricName,
        path: row.metricPath,
        // 選填欄位只在真的有值時才加進物件——跟原本手寫陣列的寫法一致（省略欄位，不是設成
        // undefined），確保 deepStrictEqual 這種連「有沒有這個 key」都比對的檢查能通過。
        ...(metricModelKey !== undefined && { modelKey: metricModelKey }),
        ...(metricDescription !== undefined && { description: metricDescription }),
        ...(metricSource !== undefined && { source: metricSource }),
        unit: metricUnit,
        fields: [],
      };
      metricsByKey.set(row.metricKey, metric);
      category.metrics.push(metric);
    } else {
      assertConsistent(rowIndex, row.metricKey, 'metricName', metric.name, row.metricName);
      assertConsistent(rowIndex, row.metricKey, 'metricPath', metric.path, row.metricPath);
    }

    const fieldDescription = orEmpty(row.fieldDescription);
    const fieldSource = orEmpty(row.fieldSource);
    const field: FilterField = {
      key: row.fieldKey,
      name: row.fieldName,
      period: row.fieldPeriod as FilterFieldPeriod,
      sort: Number(row.fieldSort),
      ...(fieldDescription !== undefined && { description: fieldDescription }),
      ...(fieldSource !== undefined && { source: fieldSource }),
      ...(fieldUnitRaw !== undefined && { unit: fieldUnitRaw as FilterUnit }),
      ...(row.fieldAliases !== '' && { aliases: row.fieldAliases.split(';') }),
    };
    metric.fields.push(field);
  });

  return [...categoriesByKey.values()];
};
