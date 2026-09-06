import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateRoe } from '@/domainMetrics/roe';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// 驗證 P0 止血機制（src/adapters/prisma/upsertShadowExtension.ts）：upsert 覆蓋既有列前
// 先把舊值存進 metric_upsert_shadow，值沒變則跳過（不無限疊加重複快照）。用 2330 115Q2
// 這組真實座標，先算出正確值，直接把資料庫裡的值改成一個刻意錯誤的值（模擬「先前存了之後
// 被重編推翻的舊值」，不碰任何來源資料），重跑一次應該重新算出正確值、觸發覆蓋、寫一筆快照
// 記下那個錯誤值；再跑一次因為值不再變動，不應該再新增快照。

const PRIMARY_KEY = {
  symbol_year_season_dataType_subsidiaryCompanyId: { symbol: '2330', year: 115, season: 2, dataType: '2', subsidiaryCompanyId: '' },
};

const countShadows = () => analysisPrisma.metricUpsertShadow.count({ where: { modelName: 'RoeResult', primaryKey: { equals: PRIMARY_KEY } } });

test('upsertShadowExtension: upsert 覆蓋既有列時正確產生快照，值不變時正確跳過（去重）', async () => {
  // 先清掉這個座標既有的快照，建立乾淨基準。
  await analysisPrisma.metricUpsertShadow.deleteMany({ where: { modelName: 'RoeResult', primaryKey: { equals: PRIMARY_KEY } } });

  // 1. 算出正確值（來源資料不變，之後重跑都會得到同一個答案）。
  const correct = await calculateRoe({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(correct.roeQuarterlyPct, 10.98);
  assert.equal(await countShadows(), 0, '剛清空基準，這次重算值沒變（跟資料庫裡已有的正確值相同），不應該產生快照');

  // 2. 直接把資料庫改成一個刻意錯誤的值，模擬「之前存了之後被重編推翻的舊值」。
  await analysisPrisma.roeResult.update({
    where: PRIMARY_KEY,
    data: { roeQuarterlyPct: 999.99 },
  });

  // 3. 重跑：來源資料沒變，會重新算出跟步驟 1 相同的正確值，觸發覆蓋 999.99 -> 10.98。
  const afterFix = await calculateRoe({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(afterFix.roeQuarterlyPct, 10.98);
  assert.equal(await countShadows(), 1, '值從 999.99 覆蓋回 10.98，應該產生剛好一筆快照');

  const shadows = await analysisPrisma.metricUpsertShadow.findMany({ where: { modelName: 'RoeResult', primaryKey: { equals: PRIMARY_KEY } } });
  const previousRow = shadows[0]!.previousRow as { roeQuarterlyPct: string };
  assert.equal(previousRow.roeQuarterlyPct, '999.99', '快照記下的應該是被覆蓋前的錯誤值');

  // 4. 再跑一次：這次值沒變（已經是 10.98），去重邏輯應該跳過，不新增快照。
  await calculateRoe({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(await countShadows(), 1, '值沒變不應該再新增快照');
});

afterAll(async () => {
  await analysisPrisma.metricUpsertShadow.deleteMany({ where: { modelName: 'RoeResult', primaryKey: { equals: PRIMARY_KEY } } });
  await analysisPrisma.$disconnect();
  await mopsExportPrisma.$disconnect();
});
