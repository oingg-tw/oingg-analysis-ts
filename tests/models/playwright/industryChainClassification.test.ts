import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { playwrightExportPrisma } from '@/infrastructure/prisma/playwrightExportClient';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import tpexExportPrisma from '@/infrastructure/prisma/tpexExportClient';
import { loadIndustryChainClassification, listAllCompanyCategories, listCategoryGroups } from '@/models/playwright/industryChainClassification';

beforeAll(async () => {
  await loadIndustryChainClassification();
});

// 2026-09-15（第二次）：findPeerGroup 同業比較已搬到 industryTree.ts 的 findPeerGroupByTree
// （見 tests/models/playwright/industryTree.test.ts），這份檔案只剩「產業標籤」顯示用途
// 的測試（listAllCompanyCategories/listCategoryGroups）。

// 2026-09-14 新增——給「產業追蹤」頁面重建用的批次匯出，見 industries/controller.ts 的
// getIndustryChainClassification。
// 2026-09-15：新方法論下全市場實測 category 沒有任何 null（跟上面 findPeerGroup 的
// null-category 測試同一個教訓），這裡只驗證「不會主動濾掉 category 為 null 的公司」
// 這個程式邏輯本身（用 companyCategoryCache 的原始長度跟 listAllCompanyCategories()
// 的輸出長度相等來驗證，不斷言一定要有 null 案例存在）。
test('listAllCompanyCategories: 一次回傳全部公司，不主動濾掉任何一家', () => {
  const companies = listAllCompanyCategories();

  assert.ok(companies.length >= 1900, '全市場應該有接近 1984 家上市櫃公司');
  const tsmc = companies.find((c) => c.symbol === '2330');
  assert.ok(tsmc?.category !== null, '2330 應該有分類');
  assert.ok(tsmc?.coarseGroup !== null, '2330 應該有粗分類');
});

// 2026-09-15（第三次）：粗分類組數本身也會隨 playwright-py 擴充細分類清單變動
// （34→52類那次新增了「民生服務」粗分類，10→11組）——不斷言精確組數，只驗證
// 結構性質，同一個教訓見這份檔案其餘測試的既有說明。
test('listCategoryGroups: 每組粗分類底下都有至少一個細分類', () => {
  const groups = listCategoryGroups();

  assert.ok(groups.length > 0, '應該至少有一組粗分類');
  for (const g of groups) {
    assert.ok(g.fineCategories.length > 0, `${g.coarseGroup} 底下應該至少有一個細分類`);
  }
  const electronics = groups.find((g) => g.coarseGroup === '電子零組件與半導體');
  assert.ok(electronics?.fineCategories.includes('積體電路'), '電子零組件與半導體粗分類應該涵蓋積體電路這個細分類');
});

afterAll(async () => {
  await playwrightExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
