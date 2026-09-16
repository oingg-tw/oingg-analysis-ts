import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { METRIC_CATEGORIES } from '@/domain/metrics/categories';
import { METRIC_FOLDER_INDEX } from '@/domain/metrics/folderIndex';

// 執行期不再掃資料夾（prod image 不帶 src/），改在測試期守門：產生的索引必須跟實際的
// src/domain/metrics/<分類>/ 子資料夾一致，新增/搬移指標資料夾後要重跑產生器。
const ROOT = join(process.cwd(), 'src', 'domain', 'metrics');
const listSubdirectoryNames = (dir: string): string[] => readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory()).sort();

test('METRIC_FOLDER_INDEX 跟 src/domain/metrics/<分類>/ 的實際資料夾一致（不一致就跑 npx tsx scripts/codemods/generateMetricFolderIndex.ts）', () => {
  const actual = Object.fromEntries(METRIC_CATEGORIES.map(({ key }) => [key, listSubdirectoryNames(join(ROOT, key))]));
  expect(METRIC_FOLDER_INDEX).toEqual(actual);
});

test('每個分類至少有一個指標資料夾，且資料夾名稱不重複跨分類', () => {
  const all = METRIC_CATEGORIES.flatMap(({ key }) => METRIC_FOLDER_INDEX[key]);
  expect(new Set(all).size).toBe(all.length);
  for (const { key } of METRIC_CATEGORIES) expect(METRIC_FOLDER_INDEX[key].length).toBeGreaterThan(0);
});
