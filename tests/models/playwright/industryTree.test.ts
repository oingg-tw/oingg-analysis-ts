import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { playwrightExportPrisma } from '@/adapters/prisma/playwrightExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet } from '@/models/companyProfile';
import { loadIndustryTree, listIndustryTree, findPeerGroupByTree } from '@/models/playwright/industryTree';

let candidatePool: Set<string>;

beforeAll(async () => {
  await loadIndustryTree();
  candidatePool = await getSecuritySymbolSet({ preferredStock: 'exclude' });
});

// 2026-09-15（第二次）：findPeerGroup 同業比較改用這棵樹的葉節點當第一選擇，取代
// industryChainClassification.ts 原本用 33 類 category 當第一選擇的版本（那份測試移到
// industryChainClassification.test.ts，只剩「產業標籤」顯示用途）。跟上一輪同一個教訓——
// playwright-py 的樹狀資料還在持續調整（分群演算法/報告更新後 node_id 會整個洗牌），這裡
// 刻意不斷言精確數字/寫死特定 node_id，只驗證關係性質，避免測試隨資料源改善變脆弱。

test('listIndustryTree: 整棵樹至少有節點，且葉節點成員數加總跟全市場公司數量級一致', () => {
  const roots = listIndustryTree();
  assert.ok(roots.length > 0, '應該至少有一個頂層粗分類節點');

  const countLeafMembers = (nodes: ReturnType<typeof listIndustryTree>): number =>
    nodes.reduce((sum, n) => sum + (n.children.length === 0 ? n.memberSymbols.length : countLeafMembers(n.children)), 0);
  const totalMembers = countLeafMembers(roots);
  assert.ok(totalMembers >= 1900, `全市場應該有接近 1984 家上市櫃公司在樹的葉節點裡，實際 ${totalMembers}`);
});

test('findPeerGroupByTree: 2330 應該找到精確的產業內區隔（segment）層級同業', () => {
  const result = findPeerGroupByTree('2330', candidatePool, 3);

  assert.equal(result.found, true);
  assert.equal(result.nodeType, 'segment', '2330 所在的細分區隔同業數應該遠超過門檻，不需要往上退');
  assert.ok(result.nodeId !== null && result.label !== null);
  assert.ok(result.peers.length >= 3);
  assert.ok(result.peers.includes('2330'), '同業清單應該含目標公司自己');
});

// 現查一個目前樣本數明顯偏少的葉節點（不寫死是哪一個，避免資料源持續改善後這個節點的
// 公司數剛好超過門檻，測試就壞掉），驗證同業數不足時會沿 parent_id 往上退。
test('findPeerGroupByTree: 產業內區隔同業數不足時會沿 parent_id 往上退', async () => {
  const smallLeafRows = await playwrightExportPrisma.$queryRaw<{ node_id: string; n: bigint }[]>`
    SELECT m.node_id, count(*)::bigint AS n
    FROM "export"."industry_tree_members" m
    JOIN "export"."industry_tree_nodes" n ON n.node_id = m.node_id
    WHERE n.node_type != 'misc'
    GROUP BY m.node_id
    ORDER BY n ASC LIMIT 1
  `;
  assert.ok(smallLeafRows.length > 0, '前提：至少要有一個非 misc 的葉節點');
  const { node_id: smallLeafNodeId, n } = smallLeafRows[0]!;
  const minPeers = Number(n) + 3; // 刻意設得比這個葉節點的公司數還多，強迫觸發回退

  const targetRows = await playwrightExportPrisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM "export"."industry_tree_members" WHERE node_id = ${smallLeafNodeId} LIMIT 1
  `;
  const target = targetRows[0]!.code;

  const result = findPeerGroupByTree(target, candidatePool, minPeers);

  assert.equal(result.found, true);
  assert.notEqual(result.nodeId, smallLeafNodeId, `${smallLeafNodeId} 只有 ${n} 家，minPeers=${minPeers} 應該觸發往上退到別的節點`);
  assert.ok(result.peers.includes(target));
  assert.ok(result.peers.length >= minPeers);
});

// misc 桶（「其他（共用上下游太少）」長尾桶）不當同業池——現查一家落在 misc 桶的公司，
// 驗證回傳的層級不是 misc，而是直接跳到最近的 category 祖先（或更上層，如果 category
// 本身同業還是不夠）。
test('findPeerGroupByTree: 落在 misc 長尾桶的公司會跳過 misc，直接從 category 層級起算', async () => {
  const miscMemberRows = await playwrightExportPrisma.$queryRaw<{ code: string }[]>`
    SELECT m.code
    FROM "export"."industry_tree_members" m
    JOIN "export"."industry_tree_nodes" n ON n.node_id = m.node_id
    WHERE n.node_type = 'misc' LIMIT 1
  `;
  assert.ok(miscMemberRows.length > 0, '前提：至少要有一家公司落在 misc 桶');
  const target = miscMemberRows[0]!.code;

  const result = findPeerGroupByTree(target, candidatePool, 3);

  assert.equal(result.found, true);
  assert.notEqual(result.nodeType, 'misc', 'misc 桶本身不應該被當成同業比較用的層級');
  assert.ok(result.peers.includes(target));
});

test('findPeerGroupByTree: minPeers 設得比全市場還大時，退到根節點都不夠，應該老實回 insufficient_peers', () => {
  const result = findPeerGroupByTree('2330', candidatePool, 999999);

  assert.equal(result.found, false);
  assert.equal(result.notFoundReason, 'insufficient_peers');
  assert.deepEqual(result.peers, []);
});

test('findPeerGroupByTree: 查無此公司代號（不存在的 symbol）應該回傳 not_classified，不拋錯', () => {
  const result = findPeerGroupByTree('0000000', candidatePool, 3);

  assert.equal(result.found, false);
  assert.equal(result.notFoundReason, 'not_classified');
});

afterAll(async () => {
  await playwrightExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
