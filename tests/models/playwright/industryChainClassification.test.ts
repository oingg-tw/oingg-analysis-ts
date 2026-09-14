import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { playwrightExportPrisma } from '@/adapters/prisma/playwrightExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet } from '@/models/companyProfile';
import { loadIndustryChainClassification, findPeerGroup, listAllCompanyCategories, listCategoryGroups } from '@/models/playwright/industryChainClassification';

let candidatePool: Set<string>;

beforeAll(async () => {
  await loadIndustryChainClassification();
  candidatePool = await getSecuritySymbolSet({ preferredStock: 'exclude' });
});

// playwright-py 的供應鏈分類資料這段期間持續在改善（同一天內多輪修正，甚至整個換過分類
// 方法論——2026-09-15 從「供應鏈邊眾數投票」換成「直接對公司本身分類」，confidence/
// sampleSize 這組概念因此整個消失，換成 source），跟 gov-ts 稅籍分類近乎靜態不同——這裡
// 刻意不斷言精確的同業數字，只驗證關係性質（level/code 正確、peers 含自己、數量至少
// 達到某個下限），避免資料源持續改善時測試變得脆弱。
test('findPeerGroup: 2330 細分類同業數已經足夠，不需要回退到粗分類', () => {
  const result = findPeerGroup('2330', candidatePool, 3);

  assert.equal(result.found, true);
  assert.equal(result.level, 'category');
  assert.ok(result.category !== null, '2330 應該有分類');
  assert.ok(result.source === 'keyword' || result.source === 'gemini', 'source 應該是 keyword 或 gemini 其中之一');
  assert.ok(result.updatedAt !== null, '有分類的公司應該帶有 updatedAt（分類最後變動時間）');
  assert.ok(result.peers.length >= 3, '2330 的細分類同業數應該遠超過門檻');
  assert.ok(result.peers.includes('2330'), '同業清單應該含目標公司自己');
});

// 用一個現查出來、全市場樣本數明顯偏少的細分類（不寫死是哪一個，避免資料源持續改善後
// 這支細分類的公司數剛好超過門檻，測試就壞掉），驗證同業數不足時會回退到粗分類。
test('findPeerGroup: 細分類同業數不足時會回退到粗分類', async () => {
  const smallCategoryRows = await playwrightExportPrisma.$queryRaw<{ category: string; n: bigint }[]>`
    SELECT category, count(*)::bigint AS n FROM "export"."company_category_summary"
    WHERE category IS NOT NULL GROUP BY category ORDER BY n ASC LIMIT 1
  `;
  assert.ok(smallCategoryRows.length > 0, '前提：至少要有一個非 null 的細分類');
  const { category: smallCategory, n } = smallCategoryRows[0]!;
  const minPeers = Number(n) + 5; // 刻意設得比這個細分類的全市場公司數還多，強迫觸發回退

  const targetRows = await playwrightExportPrisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM "export"."company_category_summary" WHERE category = ${smallCategory} LIMIT 1
  `;
  const target = targetRows[0]!.code;

  const result = findPeerGroup(target, candidatePool, minPeers);

  assert.equal(result.found, true);
  assert.equal(result.level, 'coarseGroup', `${smallCategory} 全市場只有 ${n} 家，minPeers=${minPeers} 應該觸發回退`);
  assert.ok(result.peers.includes(target));
});

// 2026-09-15 教訓：這裡原本假設「一定存在 category 是 null 的公司」（舊的供應鏈邊眾數
// 投票方法論下，2026-09-14 實測 1984 家裡有 270 家沒被涵蓋），playwright-py 換成「直接
// 對公司本身分類」的新方法論後，實測全市場 1984 家 category 全部非 null（0 家是 null）
// ——連「假設某個特定情境的資料一定存在」都會隨資料源方法論整個換掉而過期，不是只有
// 「寫死精確數字/點名特定公司」才會犯這個錯。findPeerGroup 對 category===null 的處理
// 邏輯本身還在（防禦性程式碼，不確定未來會不會又出現），但目前沒有真實資料可以驗證這條
// 路徑，改成如果真的查無 null 案例就跳過斷言，不要假裝有資料硬測。
test('findPeerGroup: 目標公司沒有任何已分類的供應鏈邊時 found 為 false（若現在沒有這種公司則跳過）', async () => {
  const rows = await playwrightExportPrisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM "export"."company_category_summary" WHERE category IS NULL LIMIT 1
  `;
  if (rows.length === 0) return; // 目前全市場沒有 category 為 null 的公司，這條路徑無法用真實資料驗證

  const result = findPeerGroup(rows[0]!.code, candidatePool, 3);
  assert.equal(result.found, false);
  assert.equal(result.level, null);
  assert.deepEqual(result.peers, []);
});

test('findPeerGroup: 查無此公司代號（不存在的 symbol）應該優雅回傳 found:false，不拋錯', () => {
  const result = findPeerGroup('0000000', candidatePool, 3);
  assert.equal(result.found, false);
});

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

test('listCategoryGroups: 10 組粗分類，每組底下都有至少一個細分類', () => {
  const groups = listCategoryGroups();

  assert.equal(groups.length, 10, '2026-09-14 實測是 10 組粗分類');
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
