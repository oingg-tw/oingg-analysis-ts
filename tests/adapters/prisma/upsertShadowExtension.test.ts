import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateBeta } from '@/domainMetrics/beta';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

// 驗證 P0 止血機制（src/adapters/prisma/upsertShadowExtension.ts）：upsert 覆蓋既有列前
// 先把舊值存進 metric_upsert_shadow，值沒變則跳過（不無限疊加重複快照）。這支測試本身在驗證
// 這個泛化 Prisma extension 機制，不是在驗證任何一支指標的公式正確性，選哪個 model 當範例
// 不重要——2026-09-07 使用者要求把舊架構「單一指標一張表」的 34 張 Result 表整批 DROP，
// 原本這裡用的 RoeResult 已經不存在，改用倖存的 BetaResult（跟 marketRatios 是僅存的兩個
// 舊架構家族）。用固定的 asOfDate（不用「今天」）確保 PK 穩定，不受同一測試檔案外其他測試
// 對 2330 這個 symbol 用「最新交易日」預設值寫入 BetaResult 的影響。
//
// 用 2330 這組真實座標，先算出正確值（不預先假設是哪個數字，直接呼叫一次拿到當下的真實計算
// 結果，因為來源股價資料不變，之後重跑都會得到同一個答案），直接把資料庫裡的值改成一個刻意
// 錯誤的值（模擬「先前存了之後被重編推翻的舊值」，不碰任何來源資料），重跑一次應該重新算出
// 正確值、觸發覆蓋、寫一筆快照記下那個錯誤值；再跑一次因為值不再變動，不應該再新增快照。

const AS_OF_DATE = '2026-08-11';

const PRIMARY_KEY = {
  symbol_tradeDate: { symbol: '2330', tradeDate: new Date(`${AS_OF_DATE}T00:00:00.000Z`) },
};

const countShadows = () => analysisPrisma.metricUpsertShadow.count({ where: { modelName: 'BetaResult', primaryKey: { equals: PRIMARY_KEY } } });

test('upsertShadowExtension: upsert 覆蓋既有列時正確產生快照，值不變時正確跳過（去重）', async () => {
  // 先清掉這個座標既有的快照，建立乾淨基準。
  await analysisPrisma.metricUpsertShadow.deleteMany({ where: { modelName: 'BetaResult', primaryKey: { equals: PRIMARY_KEY } } });

  // 1. 算出正確值（來源股價資料不變，之後重跑都會得到同一個答案）。
  const correct = await calculateBeta({ symbol: '2330', asOfDate: AS_OF_DATE });
  const correctBeta1Y = correct.beta1Y.value;
  assert.ok(correctBeta1Y !== null, '2330 2026-08-11 應該有完整重疊交易日資料算得出 Beta');
  assert.equal(await countShadows(), 0, '剛清空基準，這次重算值沒變（跟資料庫裡已有的正確值相同），不應該產生快照');

  // 2. 直接把資料庫改成一個刻意錯誤的值，模擬「之前存了之後被重編推翻的舊值」。
  await analysisPrisma.betaResult.update({
    where: PRIMARY_KEY,
    data: { beta1Y: 999.99 },
  });

  // 3. 重跑：來源資料沒變，會重新算出跟步驟 1 相同的正確值，觸發覆蓋 999.99 -> correctBeta1Y。
  const afterFix = await calculateBeta({ symbol: '2330', asOfDate: AS_OF_DATE });
  assert.equal(afterFix.beta1Y.value, correctBeta1Y);
  assert.equal(await countShadows(), 1, `值從 999.99 覆蓋回 ${correctBeta1Y}，應該產生剛好一筆快照`);

  const shadows = await analysisPrisma.metricUpsertShadow.findMany({ where: { modelName: 'BetaResult', primaryKey: { equals: PRIMARY_KEY } } });
  const previousRow = shadows[0]!.previousRow as { beta1Y: string };
  assert.equal(previousRow.beta1Y, '999.99', '快照記下的應該是被覆蓋前的錯誤值');

  // 4. 再跑一次：這次值沒變（已經回到 correctBeta1Y），去重邏輯應該跳過，不新增快照。
  await calculateBeta({ symbol: '2330', asOfDate: AS_OF_DATE });
  assert.equal(await countShadows(), 1, '值沒變不應該再新增快照');
});

afterAll(async () => {
  await analysisPrisma.metricUpsertShadow.deleteMany({ where: { modelName: 'BetaResult', primaryKey: { equals: PRIMARY_KEY } } });
  await analysisPrisma.$disconnect();
  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
});
