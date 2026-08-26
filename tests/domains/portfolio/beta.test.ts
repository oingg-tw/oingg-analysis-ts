import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBeta } from '../../../src/domains/portfolio/beta/service';
import prisma from '../../../src/adapters/prisma/index';
import { analysisPrisma } from '../../../src/adapters/prisma/analysisClient';

// Beta 用的是逐日更新的股價/指數資料（不是季度財報那種固定不變的歷史快照——2026-08-26 開發過程中
// 親眼看過 daily_market_index 的資料一個 session 內就從涵蓋到 06-30 變成涵蓋到 08-26），
// 所以這裡不釘死確切數值，只驗證「合理性」跟「結構」，避免資料每天更新就讓測試炸掉。
test('beta: 2330 有資料，三個窗口都能算出合理範圍內的值', async () => {
  const result = await calculateBeta({ companyId: '2330' });

  assert.equal(result.companyId, '2330');
  assert.ok(result.asOfDate !== null, '2330 應該要能找到重疊交易日當基準日');
  assert.deepEqual(result.fieldStatuses, {}, '2330 目前資料齊全，不應該有任何 fieldStatuses 項目');
  assert.deepEqual(result.warnings, []);

  for (const window of [result.beta1Y, result.beta2Y, result.beta5Y] as const) {
    assert.ok(window.value !== null, '2330 資料量足夠，三個窗口都應該算得出 Beta');
    // Beta 沒有理論上限，但個股 Beta 落在 -5 ~ 5 之外基本上代表算法出錯，不是正常的市場風險係數。
    assert.ok(window.value! > -5 && window.value! < 5, `Beta 值 ${window.value} 超出合理範圍`);
    assert.ok(window.observations >= 20, 'observations 應該至少達到最低樣本數門檻');
    assert.ok(window.windowStart !== null && window.windowEnd !== null);
  }

  // 窗口越長，理論上重疊交易日數應該越多（或至少不會變少）。
  assert.ok(result.beta2Y.observations >= result.beta1Y.observations);
  assert.ok(result.beta5Y.observations >= result.beta2Y.observations);
});

test('beta: 查無資料的公司回傳 not_applicable，不是拋錯或裝作查得到', async () => {
  const result = await calculateBeta({ companyId: '9999' });

  assert.equal(result.companyId, '9999');
  assert.equal(result.asOfDate, null);
  assert.equal(result.beta1Y.value, null);
  assert.equal(result.beta2Y.value, null);
  assert.equal(result.beta5Y.value, null);

  for (const field of ['beta1Y', 'beta2Y', 'beta5Y']) {
    assert.equal(result.fieldStatuses[field]?.status, 'not_applicable');
  }
  assert.ok(result.warnings.length > 0);
});

test('beta: asOfDate 指定成非重疊交易日時，會自動退回最近的重疊交易日', async () => {
  // 用一個確定在資料範圍內、但刻意選週末的日期（不會是交易日），驗證退回邏輯不會直接回傳 null。
  const result = await calculateBeta({ companyId: '2330', asOfDate: '2026-01-03' }); // 2026-01-03 是週六
  assert.ok(result.asOfDate !== null);
  assert.notEqual(result.asOfDate, '2026-01-03');
  assert.ok(result.asOfDate! <= '2026-01-03');
});

after(async () => {
  await prisma.$disconnect();
  await analysisPrisma.$disconnect();
});
