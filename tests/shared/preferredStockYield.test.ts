import { test } from 'vitest';
import assert from 'node:assert/strict';
import { solveYieldToCall, resolveYtcPeriods } from '@/shared/preferredStockYield';

// n=1 有封閉解可以交叉驗證：P0 = (D+CallPrice)/(1+y) => y = (D+CallPrice)/P0 - 1。
test('solveYieldToCall: n=1 時應該精確等於封閉解', () => {
  const y = solveYieldToCall({ currentPrice: 100, dividendRate: 5, callPrice: 100, periods: 1 });
  assert.ok(Math.abs(y - 0.05) < 0.0001, `預期約 0.05，實際 ${y}`);
});

test('solveYieldToCall: n=1，現價低於發行價時殖利率應該高於票面利率', () => {
  // D=5, CallPrice=100, P0=95 => y = 105/95 - 1 = 0.10526...
  const y = solveYieldToCall({ currentPrice: 95, dividendRate: 5, callPrice: 100, periods: 1 });
  assert.ok(Math.abs(y - (105 / 95 - 1)) < 0.0001, `預期約 ${105 / 95 - 1}，實際 ${y}`);
});

// n>1 沒有封閉解，用自洽性驗證：算出來的 y 代回現值公式應該等於 P0（二分法收斂正確性）。
test('solveYieldToCall: n=3 多期情境，算出的 y 代回現值公式應該等於 P0（自洽性驗證）', () => {
  const currentPrice = 95;
  const dividendRate = 5;
  const callPrice = 100;
  const periods = 3;
  const y = solveYieldToCall({ currentPrice, dividendRate, callPrice, periods });

  let pv = 0;
  for (let t = 1; t <= periods; t++) {
    pv += dividendRate / (1 + y) ** t;
  }
  pv += callPrice / (1 + y) ** periods;

  assert.ok(Math.abs(pv - currentPrice) < 0.01, `代回現值公式應該約等於 ${currentPrice}，實際 ${pv}`);
});

test('solveYieldToCall: n=10 多期情境，自洽性驗證', () => {
  const currentPrice = 42.25;
  const dividendRate = 1.8;
  const callPrice = 45;
  const periods = 10;
  const y = solveYieldToCall({ currentPrice, dividendRate, callPrice, periods });

  let pv = 0;
  for (let t = 1; t <= periods; t++) {
    pv += dividendRate / (1 + y) ** t;
  }
  pv += callPrice / (1 + y) ** periods;

  assert.ok(Math.abs(pv - currentPrice) < 0.01, `代回現值公式應該約等於 ${currentPrice}，實際 ${pv}`);
});

test('resolveYtcPeriods: 贖回日在未來，應該回傳 scheduled_redemption_date 跟正確期數', () => {
  const asOfDate = new Date('2026-09-07');
  const redemptionDate = new Date('2029-03-07'); // 約 2.5 年後，無條件進位應該是 3
  const result = resolveYtcPeriods(redemptionDate, asOfDate);
  assert.equal(result.assumption, 'scheduled_redemption_date');
  assert.equal(result.periods, 3);
});

test('resolveYtcPeriods: 贖回日在未來但不到一年，期數應該至少是 1', () => {
  const asOfDate = new Date('2026-09-07');
  const redemptionDate = new Date('2026-12-07'); // 3 個月後
  const result = resolveYtcPeriods(redemptionDate, asOfDate);
  assert.equal(result.assumption, 'scheduled_redemption_date');
  assert.equal(result.periods, 1);
});

test('resolveYtcPeriods: 贖回日已過，應該回傳 past_redemption_date_assumed_next_period 跟 periods=1', () => {
  const asOfDate = new Date('2026-09-07');
  const redemptionDate = new Date('2023-12-13'); // 已過
  const result = resolveYtcPeriods(redemptionDate, asOfDate);
  assert.equal(result.assumption, 'past_redemption_date_assumed_next_period');
  assert.equal(result.periods, 1);
});
