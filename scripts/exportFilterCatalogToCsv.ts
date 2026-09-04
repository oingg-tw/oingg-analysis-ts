// 一次性遷移工具（2026-09-05）：把當時手寫在 filterCatalog.ts 裡的 FilterCategory[] 陣列字面量
// 攤平匯出成 src/api/bff/filter/filterCatalog.csv——filterCatalog.ts 之後改成從這個 CSV 讀取
// （見 loadFilterCatalog.ts），不再手寫巢狀陣列。保留在 scripts/ 當備用工具：之後如果 CSV
// 資料損毀、或想從頭重新產生一份範本，可以先暫時把舊陣列貼回 filterCatalog.ts 再跑一次這支。
//
// 用法：npx tsx scripts/exportFilterCatalogToCsv.ts
import { writeFileSync } from 'fs';
// 型別匯入時的迴避：這支腳本執行當下 filterCatalog.ts 應該還是手寫陣列版本（遷移前），
// 執行完、驗證過 CSV 之後才把 filterCatalog.ts 換成讀 CSV 版本。
import { filterCatalog } from '../src/api/bff/filter/filterCatalog';

// 這裡只需要「寫」CSV，不需要「讀」——讀的邏輯（真正要處理各種邊界情況）交給執行期會用到的
// csv-parse。寫的規則簡單很多（RFC4180：欄位內含逗號/雙引號/換行才需要用雙引號包起來，
// 內部的雙引號用兩個雙引號跳脫），手刻一個就好，不用為了這支一次性腳本多裝 csv-stringify。
const csvCell = (value: string): string => {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
};

const CSV_COLUMNS = [
  'categoryKey',
  'categoryName',
  'metricKey',
  'metricName',
  'metricPath',
  'metricModelKey',
  'metricDescription',
  'metricSource',
  'metricUnit',
  'fieldKey',
  'fieldName',
  'fieldPeriod',
  'fieldSort',
  'fieldDescription',
  'fieldSource',
  'fieldUnit',
  'fieldAliases',
] as const;

const rows: Record<(typeof CSV_COLUMNS)[number], string>[] = [];

for (const category of filterCatalog) {
  for (const metric of category.metrics) {
    for (const field of metric.fields) {
      rows.push({
        categoryKey: category.key,
        categoryName: category.name,
        metricKey: metric.key,
        metricName: metric.name,
        metricPath: metric.path,
        metricModelKey: metric.modelKey ?? '',
        metricDescription: metric.description ?? '',
        metricSource: metric.source ?? '',
        metricUnit: metric.unit,
        fieldKey: field.key,
        fieldName: field.name,
        fieldPeriod: field.period,
        fieldSort: String(field.sort),
        fieldDescription: field.description ?? '',
        fieldSource: field.source ?? '',
        fieldUnit: field.unit ?? '',
        fieldAliases: field.aliases ? field.aliases.join(';') : '',
      });
    }
  }
}

const lines = [CSV_COLUMNS.join(','), ...rows.map((row) => CSV_COLUMNS.map((col) => csvCell(row[col])).join(','))];
writeFileSync('src/api/bff/filter/filterCatalog.csv', lines.join('\n') + '\n', 'utf-8');
console.log(`寫入 ${rows.length} 列到 src/api/bff/filter/filterCatalog.csv`);
