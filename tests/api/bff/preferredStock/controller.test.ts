import { test } from 'vitest';
import assert from 'node:assert/strict';
import { compareBySortField } from '@/api/bff/preferredStock/controller';

test('compareBySortField: 數值欄位 asc/desc 排序', () => {
  const a = { ytcPct: 3 };
  const b = { ytcPct: 5 };
  assert.ok(compareBySortField(a, b, 'ytcPct', 'asc') < 0, 'asc 時 a(3) 應該排在 b(5) 前面');
  assert.ok(compareBySortField(a, b, 'ytcPct', 'desc') > 0, 'desc 時 a(3) 應該排在 b(5) 後面');
});

test('compareBySortField: 字串欄位（例如 issueDate ISO 字串）字典序排序', () => {
  const a = { issueDate: '2020-01-01' };
  const b = { issueDate: '2023-06-15' };
  assert.ok(compareBySortField(a, b, 'issueDate', 'asc') < 0);
  assert.ok(compareBySortField(a, b, 'issueDate', 'desc') > 0);
});

test('compareBySortField: null 一律排最後，不管 asc/desc', () => {
  const withValue = { ytcPct: 3 };
  const withNull = { ytcPct: null };
  assert.ok(compareBySortField(withNull, withValue, 'ytcPct', 'asc') > 0, 'asc：null 排在有值的後面');
  assert.ok(compareBySortField(withNull, withValue, 'ytcPct', 'desc') > 0, 'desc：null 仍然排在有值的後面');
  assert.ok(compareBySortField(withValue, withNull, 'ytcPct', 'asc') < 0);
  assert.ok(compareBySortField(withValue, withNull, 'ytcPct', 'desc') < 0);
});

test('compareBySortField: 兩邊都是 null 視為相等', () => {
  assert.equal(compareBySortField({ ytcPct: null }, { ytcPct: null }, 'ytcPct', 'asc'), 0);
});
