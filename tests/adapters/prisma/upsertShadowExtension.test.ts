import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateEquityRiskPremium } from '@/domainMacro/equityRiskPremium/service';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { govExportPrisma } from '@/adapters/prisma/govExportClient';

// 驗證 P0 止血機制（src/adapters/prisma/upsertShadowExtension.ts）：upsert 覆蓋既有列前
// 先把舊值存進 metric_upsert_shadow，值沒變則跳過（不無限疊加重複快照）。這支測試本身在驗證
// 這個泛化 Prisma extension 機制，不是在驗證任何一支指標的公式正確性，選哪個 model 當範例
// 不重要——2026-09-08 使用者要求把 filterCatalog.csv 最後 6 列（beta/marketRatios）連同
// BetaResult/MarketRatiosResult 兩張表整批退場，原本這裡用的 BetaResult 已經不存在，改用
// 唯一還存活的 EquityRiskPremiumResult（domainMacro，跟這批退場範圍無關的獨立總經資料）。
//
// EquityRiskPremiumResult 的主鍵是 windowStart+windowEnd（字串範圍，跟 beta 的
// symbol+tradeDate 形狀不同），不是固定的常數——先呼叫一次拿到「這次請求窗口實際落在
// 資料涵蓋範圍裡的真實 windowStart/windowEnd」再組出 PRIMARY_KEY，不能像 beta 那樣
// 直接把日期字串寫死在測試裡（equityRiskPremium 的窗口起訖會被裁切到實際涵蓋範圍，
// 不保證等於請求的 startYear/startMonth）。
//
// 用固定的請求窗口（不用「預設完整重疊區間」）確保裁切後的 PK 穩定，之後重複執行測試
// 都會落在同一組 windowStart/windowEnd，來源資料（TAIEX 月底收盤/10年期公債殖利率）
// 不會變動，所以每次重算都會得到同一個答案——跟 beta 測試「用固定 asOfDate 確保 PK
// 穩定」是同一個道理。

const QUERY = { startYear: 2010, startMonth: 1, endYear: 2020, endMonth: 12 };

test('upsertShadowExtension: upsert 覆蓋既有列時正確產生快照，值不變時正確跳過（去重）', async () => {
  // 先跑一次拿到這組窗口實際對應的 windowStart/windowEnd（可能因為資料涵蓋範圍被裁切，
  // 不等於請求的 2010-01/2020-12）。
  const initial = await calculateEquityRiskPremium(QUERY);
  assert.ok(initial.windowStart !== null && initial.windowEnd !== null, '應該有足夠的重疊月份算出窗口');
  assert.ok(initial.erpGeometric !== null, '應該算得出 ERP');

  const PRIMARY_KEY = { windowStart_windowEnd: { windowStart: initial.windowStart!, windowEnd: initial.windowEnd! } };
  const countShadows = () => analysisPrisma.metricUpsertShadow.count({ where: { modelName: 'EquityRiskPremiumResult', primaryKey: { equals: PRIMARY_KEY } } });

  // 清掉這個座標既有的快照，建立乾淨基準。
  await analysisPrisma.metricUpsertShadow.deleteMany({ where: { modelName: 'EquityRiskPremiumResult', primaryKey: { equals: PRIMARY_KEY } } });

  // 1. 再算一次確認正確值（來源資料不變，重跑會得到同一個答案），且剛清空基準、值沒變，
  //    這次重算不應該產生快照。
  const correct = await calculateEquityRiskPremium(QUERY);
  const correctErp = correct.erpGeometric;
  assert.equal(await countShadows(), 0, '剛清空基準，這次重算值沒變（跟資料庫裡已有的正確值相同），不應該產生快照');

  // 2. 直接把資料庫改成一個刻意錯誤的值，模擬「之前存了之後被重編推翻的舊值」。
  await analysisPrisma.equityRiskPremiumResult.update({
    where: PRIMARY_KEY,
    data: { erpGeometric: 999.99 },
  });

  // 3. 重跑：來源資料沒變，會重新算出跟步驟 1 相同的正確值，觸發覆蓋 999.99 -> correctErp。
  const afterFix = await calculateEquityRiskPremium(QUERY);
  assert.equal(afterFix.erpGeometric, correctErp);
  assert.equal(await countShadows(), 1, `值從 999.99 覆蓋回 ${correctErp}，應該產生剛好一筆快照`);

  const shadows = await analysisPrisma.metricUpsertShadow.findMany({ where: { modelName: 'EquityRiskPremiumResult', primaryKey: { equals: PRIMARY_KEY } } });
  const previousRow = shadows[0]!.previousRow as { erpGeometric: string };
  assert.equal(previousRow.erpGeometric, '999.99', '快照記下的應該是被覆蓋前的錯誤值');

  // 4. 再跑一次：這次值沒變（已經回到 correctErp），去重邏輯應該跳過，不新增快照。
  await calculateEquityRiskPremium(QUERY);
  assert.equal(await countShadows(), 1, '值沒變不應該再新增快照');

  // 清理這次測試產生的快照，不留殘留資料影響下次執行的基準判斷。
  await analysisPrisma.metricUpsertShadow.deleteMany({ where: { modelName: 'EquityRiskPremiumResult', primaryKey: { equals: PRIMARY_KEY } } });
});

afterAll(async () => {
  await analysisPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await govExportPrisma.$disconnect();
});
