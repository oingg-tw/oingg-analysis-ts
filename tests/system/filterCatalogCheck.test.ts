import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findFilterCatalogProblems } from '@/domains/system/filterCatalogCheck';
import { filterCatalog, type FilterCategory } from '@/domains/system/filterCatalog';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../prisma/analysis/schema.prisma');
const realSchemaText = readFileSync(schemaPath, 'utf-8');

describe('findFilterCatalogProblems', () => {
  test('真正的 filterCatalog.ts 目前應該跟 prisma/analysis/schema.prisma 完全一致', () => {
    const problems = findFilterCatalogProblems(filterCatalog, realSchemaText);
    assert.deepEqual(problems, []);
  });

  test('catalog 欄位在 schema 找不到對應 Decimal 欄位時要抓出來', () => {
    const fakeCatalog: FilterCategory[] = [
      {
        key: 'guru',
        name: '測試分類',
        metrics: [
          {
            key: 'grahamNumber',
            name: '葛拉漢數',
            path: '/guru/graham-number',
            fields: [{ key: 'grahamNumberTypo', name: '打錯的欄位', period: 'ttm' }],
          },
        ],
      },
    ];
    const fakeSchema = `
      model GrahamNumberResult {
        symbol String
        grahamNumber Decimal? @map("graham_number") @db.Decimal(14, 4)
      }
    `;
    const problems = findFilterCatalogProblems(fakeCatalog, fakeSchema);
    assert.equal(problems.length, 2);
    assert.match(problems[0]!, /grahamNumberTypo.*找不到對應的 Decimal 欄位/);
    assert.match(problems[1]!, /新增了 Decimal 欄位 grahamNumber.*沒有列/);
  });

  test('schema 有 model 但 catalog 完全沒列這個指標時要抓出來', () => {
    const emptyCatalog: FilterCategory[] = [];
    const fakeSchema = `
      model RoeResult {
        symbol String
        roeTtmPct Decimal? @map("roe_ttm_pct") @db.Decimal(10, 2)
      }
    `;
    const problems = findFilterCatalogProblems(emptyCatalog, fakeSchema);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /metric key："roe"/);
  });

  test('modelKey 讓一個 model 拆成多個顯示分組時，只要聯集蓋滿所有欄位就不算缺漏', () => {
    // 對應 turnoverRatio 拆成「存貨周轉率」「應收帳款周轉率」...9 個顯示分組，都指回同一個
    // TurnoverRatioResult 的情境——modelKey 不同於各自的 key，聯集要涵蓋 model 的全部欄位。
    const splitCatalog: FilterCategory[] = [
      {
        key: 'turnover',
        name: '測試分類',
        metrics: [
          {
            key: 'inventoryTurnoverRatio',
            name: '存貨周轉率',
            path: '/turnover/turnover-ratio',
            modelKey: 'turnoverRatio',
            fields: [{ key: 'inventoryTurnoverTtm', name: '存貨周轉率', period: 'ttm' }],
          },
          {
            key: 'assetTurnoverRatio',
            name: '總資產周轉率',
            path: '/turnover/turnover-ratio',
            modelKey: 'turnoverRatio',
            fields: [{ key: 'assetTurnoverTtm', name: '總資產周轉率', period: 'ttm' }],
          },
        ],
      },
    ];
    const fakeSchema = `
      model TurnoverRatioResult {
        symbol String
        inventoryTurnoverTtm Decimal? @map("inventory_turnover_ttm") @db.Decimal(14, 4)
        assetTurnoverTtm Decimal? @map("asset_turnover_ttm") @db.Decimal(14, 4)
      }
    `;
    const problems = findFilterCatalogProblems(splitCatalog, fakeSchema);
    assert.deepEqual(problems, []);
  });

  test('modelKey 拆成多個顯示分組時，聯集漏了 model 的某個欄位還是要抓出來', () => {
    const splitCatalogMissingField: FilterCategory[] = [
      {
        key: 'turnover',
        name: '測試分類',
        metrics: [
          {
            key: 'inventoryTurnoverRatio',
            name: '存貨周轉率',
            path: '/turnover/turnover-ratio',
            modelKey: 'turnoverRatio',
            fields: [{ key: 'inventoryTurnoverTtm', name: '存貨周轉率', period: 'ttm' }],
          },
          // 故意漏掉 assetTurnoverRatio 這個顯示分組——assetTurnoverTtm 應該被抓出來沒被涵蓋。
        ],
      },
    ];
    const fakeSchema = `
      model TurnoverRatioResult {
        symbol String
        inventoryTurnoverTtm Decimal? @map("inventory_turnover_ttm") @db.Decimal(14, 4)
        assetTurnoverTtm Decimal? @map("asset_turnover_ttm") @db.Decimal(14, 4)
      }
    `;
    const problems = findFilterCatalogProblems(splitCatalogMissingField, fakeSchema);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /新增了 Decimal 欄位 assetTurnoverTtm.*modelKey 為 "turnoverRatio".*都沒有列/);
  });

  test('欄位名稱以 Value 結尾的 Decimal 欄位不算「可 filter 的計算結果」，不會被抓成缺漏', () => {
    // 對應 GrahamNumberResult.epsTtmValue/bvpsValue 這種引用自其他服務的中繼值，
    // 即使型別剛好是 Decimal，也不該出現在 filterCatalog.ts 裡。
    const catalogOnlyListingGrahamNumber: FilterCategory[] = [
      {
        key: 'guru',
        name: '測試分類',
        metrics: [
          {
            key: 'grahamNumber',
            name: '葛拉漢數',
            path: '/guru/graham-number',
            fields: [{ key: 'grahamNumber', name: '葛拉漢數', period: 'ttm' }],
          },
        ],
      },
    ];
    const fakeSchema = `
      model GrahamNumberResult {
        symbol String
        grahamNumber Decimal? @map("graham_number") @db.Decimal(14, 4)
        epsTtmValue Decimal? @map("eps_ttm_value") @db.Decimal(14, 4)
        bvpsValue Decimal? @map("bvps_value") @db.Decimal(14, 4)
      }
    `;
    const problems = findFilterCatalogProblems(catalogOnlyListingGrahamNumber, fakeSchema);
    assert.deepEqual(problems, []);
  });
});
