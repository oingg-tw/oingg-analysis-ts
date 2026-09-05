import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { govExportPrisma } from '@/adapters/prisma/govExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';
import { loadIndustryClassification, findPeerGroup } from '@/shared/sourceData/industryClassification';

let candidatePool: Set<string>;

beforeAll(async () => {
  await loadIndustryClassification();
  candidatePool = await getSecuritySymbolSet({ preferredStock: 'exclude' });
});

// 7711 永擎電子（電腦製造，2711-00）子類本身就有 18 家同業（實測驗證過），不需要回退，
// gov-ts 分析師拿來當「密度夠的產業」的範例。
test('findPeerGroup: 7711 子類層級同業數已經足夠，不需要回退', () => {
  const result = findPeerGroup('7711', candidatePool, 3);

  assert.equal(result.found, true);
  assert.equal(result.level, 'subclass');
  assert.equal(result.code, '2711-00');
  assert.equal(result.peers.length, 18, '實測子類 2711-00 有 18 家公司');
  assert.ok(result.peers.includes('7711'), '同業清單應該含目標公司自己');
  assert.ok(result.name, '應該查得到中文名稱');
});

// 8462 柏文健康事業（健身中心，9312-19）子類/細類/小類都是孤例（僅自己），要一路回退到
// 中類（93 運動、娛樂及休閒服務業）才湊得到 5 家，gov-ts 分析師拿來當「回退會混進不相關
// 業務」的範例（同業其實是主題樂園、KTV）。
test('findPeerGroup: 8462 子類/細類/小類都是孤例，回退到中類才湊足門檻', () => {
  const result = findPeerGroup('8462', candidatePool, 3);

  assert.equal(result.found, true);
  assert.equal(result.level, 'division', '子類/細類/小類實測都只有自己 1 家，應該回退到最粗的中類');
  assert.equal(result.code, '93');
  assert.equal(result.peers.length, 5, '實測中類 93 有 5 家公司');
  assert.ok(result.peers.includes('8462'));
});

// KY 股（境外註冊公司）結構上沒有台灣稅籍，company_industry_classification 完全查不到，
// 這是系統性、可預期的缺口，不是資料落後——實測驗證過 1256（鮮活果汁-KY）之類的 KY 股
// 在這張表裡完全沒有 rank=0 的列。
test('findPeerGroup: KY 股（境外註冊公司）查無分類資料，found 為 false', () => {
  const result = findPeerGroup('1256', candidatePool, 3);

  assert.equal(result.found, false);
  assert.equal(result.level, null);
  assert.deepEqual(result.peers, []);
});

test('findPeerGroup: 查無此公司代號（不存在的 symbol）應該優雅回傳 found:false，不拋錯', () => {
  const result = findPeerGroup('0000000', candidatePool, 3);
  assert.equal(result.found, false);
});

afterAll(async () => {
  await govExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
