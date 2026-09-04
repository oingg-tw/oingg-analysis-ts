import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { negativeEquityWarning } from '@/shared/negativeEquityGuard';

describe('negativeEquityWarning', () => {
  test('權益為正時回傳 null，不警告', () => {
    assert.equal(negativeEquityWarning(1000n, 'ROE'), null);
  });

  test('權益為零時回傳警告（除以零本身就沒有意義）', () => {
    assert.match(negativeEquityWarning(0n, 'ROE')!, /本季期末權益為零或負數/);
  });

  test('權益為負時回傳警告，訊息帶入呼叫端指定的指標名稱', () => {
    const message = negativeEquityWarning(-500n, 'FLEV');
    assert.match(message!, /本季期末權益為零或負數/);
    assert.match(message!, /FLEV數值意義有限/);
  });

  test('權益是 null（查無資料）時回傳 null——這是另一種狀況（無法計算），不是「算出來但失真」', () => {
    assert.equal(negativeEquityWarning(null, 'ROE'), null);
  });
});
