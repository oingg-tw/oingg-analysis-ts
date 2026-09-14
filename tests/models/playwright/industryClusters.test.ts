import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { playwrightExportPrisma } from '@/adapters/prisma/playwrightExportClient';
import { loadIndustryClusters, listIndustryClusters, getExternalCompanyName } from '@/models/playwright/industryClusters';

beforeAll(async () => {
  await loadIndustryClusters();
});

// 聚落資料是 playwright-py 2026-09-14 提供的一次性 build 結果，跟 category/coarseGroup
// 一樣會持續改善（甚至重新分群後 clusterId 整個洗牌，見 industryClusters.ts 的說明），
// 這裡只驗證結構性質（113 個頂層聚落、成員數合理、clusterId 穩定排序），不斷言精確的
// 公司名單內容，避免資料源改善時測試變脆弱。
test('listIndustryClusters: 113 個頂層聚落，依 clusterId 排序', () => {
  const clusters = listIndustryClusters();

  assert.equal(clusters.length, 113, '2026-09-14 實測是 113 個頂層聚落');
  for (let i = 1; i < clusters.length; i++) {
    assert.ok(clusters[i]!.clusterId > clusters[i - 1]!.clusterId, 'clusterId 應該遞增排序');
  }
});

test('listIndustryClusters: 每個聚落的直屬成員+子聚落成員數量總和應該等於總節點數 7566', () => {
  const clusters = listIndustryClusters();

  const totalDirect = clusters.reduce((sum, c) => sum + c.directMemberCodes.length, 0);
  const totalSub = clusters.reduce((sum, c) => sum + c.subClusters.reduce((s, sc) => s + sc.memberCodes.length, 0), 0);

  assert.equal(totalDirect + totalSub, 7566, '2026-09-14 實測供應鏈圖總共 7,566 個節點（1,912 家上市櫃 + 5,654 個外部節點）');
});

test('listIndustryClusters: 只有節點數 >100 的頂層聚落才會有子聚落，其餘成員都在 directMemberCodes', () => {
  const clusters = listIndustryClusters();
  const withSubClusters = clusters.filter((c) => c.subClusters.length > 0);
  const withoutSubClusters = clusters.filter((c) => c.subClusters.length === 0);

  assert.ok(withSubClusters.length > 0, '應該存在有子聚落的頂層聚落');
  assert.ok(withoutSubClusters.length > 0, '應該存在沒有子聚落、全部成員都是直屬成員的頂層聚落');
  for (const c of withoutSubClusters) {
    assert.ok(c.directMemberCodes.length > 0, `${c.label} 沒有子聚落，直屬成員不該是空的`);
  }
});

test('getExternalCompanyName: 外部/非上市公司節點查得到中文名稱', () => {
  const clusters = listIndustryClusters();
  const allCodes = clusters.flatMap((c) => [...c.directMemberCodes, ...c.subClusters.flatMap((s) => s.memberCodes)]);
  // 找一個明顯不是台股代號格式（純數字 4 碼）的 code 來測——外部公司的 id 是公司名稱生成的字串
  const externalCode = allCodes.find((code) => !/^\d{4,6}[A-Z]?$/.test(code));
  assert.ok(externalCode, '應該存在至少一個外部公司節點');

  const entry = getExternalCompanyName(externalCode!);
  assert.ok(entry, `${externalCode} 應該在 external_companies 對照表裡查得到`);
  assert.ok(entry?.nameZh !== null || entry?.nameEn !== null, '外部公司至少要有一個語言的名稱');
});

afterAll(async () => {
  await playwrightExportPrisma.$disconnect();
});
