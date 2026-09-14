import { test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { playwrightExportPrisma } from '@/adapters/prisma/playwrightExportClient';
import { loadIndustryClusters, listIndustryClusters, getExternalCompanyName } from '@/models/playwright/industryClusters';

beforeAll(async () => {
  await loadIndustryClusters();
});

// 聚落資料是 playwright-py 持續調整的分群結果，跟 category/coarseGroup 一樣會改善，
// 甚至重新分群後 clusterId 整個洗牌、頂層聚落數量/總節點數本身都會變（2026-09-14 當天
// 發生過兩次：113→124→126 個頂層聚落，總節點數 7566→8012，見 industryClusters.ts 的
// 說明）——這裡只驗證結構性質（成員數等於資料庫現查的數字、clusterId 排序穩定、有子
// 聚落的樹狀結構成立），刻意不寫死任何精確數字，避免資料源改善/演算法調整時測試變脆弱。
test('listIndustryClusters: 至少有幾十個頂層聚落，依 clusterId 排序', () => {
  const clusters = listIndustryClusters();

  assert.ok(clusters.length > 50, '頂層聚落數量應該是幾十到一百多個這個量級（2026-09-14 實測落在 113~126 之間）');
  for (let i = 1; i < clusters.length; i++) {
    assert.ok(clusters[i]!.clusterId > clusters[i - 1]!.clusterId, 'clusterId 應該遞增排序');
  }
});

// 2026-09-14 教訓：原本以為「總節點數不受分群演算法調整影響」（節點集合沒變，只是怎麼
// 分組變了），結果同一天 playwright-py 修了一個報告解析階段的驗證漏洞（外國/未上市公司
// 的股票代號誤撞到真實上市櫃公司），重跑 pipeline 後總節點數從 7,566 變成 8,012——連
// 「總節點數不變」這個假設都不能硬寫死，改成跟資料庫現查的數字比對，不寫死任何字面數字。
test('listIndustryClusters: 每個聚落的直屬成員+子聚落成員數量總和應該等於供應鏈圖總節點數（現查資料庫比對，不寫死數字）', async () => {
  const clusters = listIndustryClusters();

  const totalDirect = clusters.reduce((sum, c) => sum + c.directMemberCodes.length, 0);
  const totalSub = clusters.reduce((sum, c) => sum + c.subClusters.reduce((s, sc) => s + sc.memberCodes.length, 0), 0);

  const rows = await playwrightExportPrisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "export"."industry_cluster_members"
  `;
  const expectedTotal = Number(rows[0]!.n);

  assert.equal(totalDirect + totalSub, expectedTotal, '快取裡的成員總數應該等於資料庫現查的 industry_cluster_members 列數');
});

test('listIndustryClusters: 每個頂層聚落自己的成員（直屬+子聚落）總和都不為 0', () => {
  const clusters = listIndustryClusters();

  assert.ok(clusters.length > 0, '應該至少有一個頂層聚落');
  for (const c of clusters) {
    const ownTotal = c.directMemberCodes.length + c.subClusters.reduce((s, sc) => s + sc.memberCodes.length, 0);
    assert.ok(ownTotal > 0, `聚落「${c.label}」（clusterId=${c.clusterId}）不該是空的`);
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
