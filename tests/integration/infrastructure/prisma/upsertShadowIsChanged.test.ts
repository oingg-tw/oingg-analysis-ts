import { expect, test } from 'vitest';
import { isChanged } from '@/infrastructure/prisma/upsertShadowExtension';

// 2026-10-08：JSON 欄位（metric_definitions.spec）原本一律判定「有變」，每輪回填都寫一筆沒變的快照。
// 純函式、不碰資料庫；放 integration 是因為 unit 測試不能 import infrastructure（分層規則）。
test('JSON 物件內容相同就不算變更，即使 key 順序不同（jsonb 會重排 key）', () => {
  const previous = { spec: { unit: '%', name: 'ROE', allowed: ['Q', 'TTM'] }, updatedAt: new Date('2026-01-01') };
  expect(isChanged(previous, { spec: { name: 'ROE', allowed: ['Q', 'TTM'], unit: '%' }, updatedAt: new Date('2026-10-08') })).toBe(false);
  expect(isChanged(previous, { spec: { name: 'ROE', allowed: ['Q', 'TTM', 'FY'], unit: '%' } })).toBe(true);
});

test('Prisma update operator 照舊保守判定有變；純量照值比對', () => {
  expect(isChanged({ count: 1 }, { count: { increment: 1 } })).toBe(true);
  expect(isChanged({ value: 'a' }, { value: 'a' })).toBe(false);
  expect(isChanged({ value: 'a' }, { value: 'b' })).toBe(true);
});
