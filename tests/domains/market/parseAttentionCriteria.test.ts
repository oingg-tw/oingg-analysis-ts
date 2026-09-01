import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttentionCriteria } from '@/domains/market/attentionStocks/parseCriteria';

test('parseAttentionCriteria: null 回傳空陣列', () => {
  assert.deepEqual(parseAttentionCriteria(null), []);
});

test('parseAttentionCriteria: 「連續N次」格式，觀察營業日數是 null', () => {
  const result = parseAttentionCriteria('115年8月28日至115年8月31日連續二次');
  assert.deepEqual(result, [{ startDate: '2026-08-28', endDate: '2026-08-31', observationDays: null, times: 2 }]);
});

test('parseAttentionCriteria: 「等N個營業日已有M次」格式', () => {
  const result = parseAttentionCriteria('115年08月20日至115年09月01日等九個營業日已有五次');
  assert.deepEqual(result, [{ startDate: '2026-08-20', endDate: '2026-09-01', observationDays: 9, times: 5 }]);
});

test('parseAttentionCriteria: 兩個子句直接串接（沒有分隔符）應該解析出兩筆', () => {
  const result = parseAttentionCriteria('115年08月27日至115年09月01日連續四次115年08月20日至115年09月01日等九個營業日已有五次');
  assert.deepEqual(result, [
    { startDate: '2026-08-27', endDate: '2026-09-01', observationDays: null, times: 4 },
    { startDate: '2026-08-20', endDate: '2026-09-01', observationDays: 9, times: 5 },
  ]);
});

test('parseAttentionCriteria: 完全無法辨識的格式回傳空陣列，不拋錯', () => {
  assert.deepEqual(parseAttentionCriteria('這是一段看不懂的說明文字'), []);
});
