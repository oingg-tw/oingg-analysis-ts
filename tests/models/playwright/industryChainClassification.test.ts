import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { playwrightExportPrisma } from '@/adapters/prisma/playwrightExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet } from '@/models/companyProfile';
import { loadIndustryChainClassification, findPeerGroup } from '@/models/playwright/industryChainClassification';

let candidatePool: Set<string>;

beforeAll(async () => {
  await loadIndustryChainClassification();
  candidatePool = await getSecuritySymbolSet({ preferredStock: 'exclude' });
});

// playwright-py 的供應鏈分類資料這段期間持續在改善（同一天內多輪修正），跟 gov-ts 稅籍
// 分類近乎靜態不同——這裡刻意不斷言精確的同業數字（例如「剛好 18 家」），只驗證關係性質
// （level/code 正確、peers 含自己、數量至少達到某個下限），避免資料源持續改善時測試變得
// 脆弱。2026-09-14 實測：2330（台積電）category=積體電路，confidence≈0.91，sampleSize=76，
// 這個細分類全市場有 117 家公司（遠超過 minPeers），不需要回退到粗分類。
test('findPeerGroup: 2330 細分類同業數已經足夠，不需要回退到粗分類', () => {
  const result = findPeerGroup('2330', candidatePool, 3, { minConfidence: 0.6, minSampleSize: 1 });

  assert.equal(result.found, true);
  assert.equal(result.level, 'category');
  assert.equal(result.code, '積體電路');
  assert.ok(result.confidence !== null && result.confidence > 0.8, '2330 自己的分類信心分數應該偏高');
  assert.ok(result.sampleSize !== null && result.sampleSize > 0);
  assert.ok(result.peers.length >= 3, '積體電路這個細分類全市場有百家以上公司，不該卡在門檻');
  assert.ok(result.peers.includes('2330'), '同業清單應該含目標公司自己');
});

// 紙業包裝材料是 2026-09-14 實測全市場樣本數明顯偏少的兩個細分類之一（全市場僅 7 家），
// 用一個略高於這個數字的 minPeers 強迫觸發回退到粗分類「工業材料與設備」。
test('findPeerGroup: 1907 細分類同業數不足，回退到粗分類', () => {
  const result = findPeerGroup('1907', candidatePool, 20, { minConfidence: 0.6, minSampleSize: 1 });

  assert.equal(result.found, true);
  assert.equal(result.level, 'coarseGroup', '紙業包裝材料全市場僅 7 家，minPeers=20 應該觸發回退');
  assert.equal(result.code, '工業材料與設備');
  assert.ok(result.peers.length >= 20, '粗分類「工業材料與設備」涵蓋鋼鐵/化學塑膠/水泥建材等細分類，樣本數應該遠超過 20');
  assert.ok(result.peers.includes('1907'));
});

// minConfidence 是候選同業自己的信心門檻，不是目標公司的門檻——用一個目標公司自己信心分數
// 較低、但仍有分類的公司驗證：即使自己信心不到門檻，findPeerGroup 照常回傳結果（不拒絕查詢），
// 只是候選池會排除掉信心更低的其他公司。minPeers 刻意設 1（兩次呼叫都必然停在細分類層級，
// 不會有一邊回退到粗分類、一邊沒有的情況——那樣兩邊比較的就不是同一個候選池範圍，比較
// peers.length 大小沒有意義，見下面對 1905 的直接存在性驗證）。
test('findPeerGroup: minConfidence 只過濾候選同業，不因為目標公司自己信心不足而拒絕查詢', () => {
  const permissive = findPeerGroup('1907', candidatePool, 1, { minConfidence: 0, minSampleSize: 0 });
  const strict = findPeerGroup('1907', candidatePool, 1, { minConfidence: 0.95, minSampleSize: 1 });

  assert.equal(permissive.found, true);
  assert.equal(strict.found, true, '目標公司自己的信心分數不影響 found，即使門檻拉到 0.95');
  assert.equal(permissive.level, 'category');
  assert.equal(strict.level, 'category', 'minPeers=1 兩邊都應該停在細分類層級，不會觸發回退');
  assert.ok(strict.peers.length <= permissive.peers.length, '同一層級下，拉高候選同業的信心門檻，同業池只會變小或不變');
  assert.ok(permissive.peers.includes('1905'), '1905（華紙）信心分數 1.0，應該通過任何門檻都在同業池裡');
});

// category=null 代表這家公司完全沒有出現在供應鏈報告裡（沒有任何已分類的邊）——
// 2026-09-14 實測全市場 1984 家裡有 270 家是這個狀態。
test('findPeerGroup: 目標公司沒有任何已分類的供應鏈邊，found 為 false', async () => {
  const rows = await playwrightExportPrisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM "export"."company_category_summary" WHERE category IS NULL LIMIT 1
  `;
  assert.ok(rows.length > 0, '前提：資料庫裡應該至少有一家公司 category 是 null');
  const result = findPeerGroup(rows[0]!.code, candidatePool, 3);

  assert.equal(result.found, false);
  assert.equal(result.level, null);
  assert.deepEqual(result.peers, []);
});

test('findPeerGroup: 查無此公司代號（不存在的 symbol）應該優雅回傳 found:false，不拋錯', () => {
  const result = findPeerGroup('0000000', candidatePool, 3);
  assert.equal(result.found, false);
});

afterAll(async () => {
  await playwrightExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
