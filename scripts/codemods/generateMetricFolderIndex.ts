import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { METRIC_CATEGORIES } from '../../src/domain/metrics/categories';

// 產生 src/domain/metrics/folderIndex.ts——GET /metrics 的分類目錄以前在執行期 readdirSync 掃
// src/domain/metrics/<分類>/ 的子資料夾（prod image 因此得帶著 src/），2026-09-17 Phase 6 改成 build 前把資料夾
// 清單產生成靜態 TS（tests/unit/domain/metrics/folderIndex.test.ts 在測試期比對「產生的索引 == 實際資料夾」，
// 忘記重跑就會紅）。新增/搬移指標資料夾後執行：npx tsx scripts/codemods/generateMetricFolderIndex.ts
const ROOT = join(process.cwd(), 'src', 'domain', 'metrics');

const listSubdirectoryNames = (dir: string): string[] => readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory()).sort();

const index = Object.fromEntries(METRIC_CATEGORIES.map(({ key }) => [key, listSubdirectoryNames(join(ROOT, key))]));

const body = Object.entries(index)
  .map(([key, folders]) => `  ${key}: [${(folders as string[]).map((f) => `'${f}'`).join(', ')}],`)
  .join('\n');

const source = `import type { MetricCategoryKey } from './categories';

// ⚠️ 產生的檔案，不要手改——內容 = src/domain/metrics/<分類>/ 底下的子資料夾名稱（每個資料夾對應一個或
// 一組 metricCode，見 application/metrics/metricFolderCatalog.ts 的 metricCodesForFolder）。
// 重新產生：npx tsx scripts/codemods/generateMetricFolderIndex.ts；tests/unit/domain/metrics/folderIndex.test.ts
// 會比對這份索引跟實際資料夾，忘記重跑就會紅。
export const METRIC_FOLDER_INDEX: Readonly<Record<MetricCategoryKey, readonly string[]>> = {
${body}
};
`;

writeFileSync(join(ROOT, 'folderIndex.ts'), source);
console.log(`已產生 src/domain/metrics/folderIndex.ts：${Object.entries(index).map(([k, v]) => `${k} ${(v as string[]).length}`).join('、')}`);
