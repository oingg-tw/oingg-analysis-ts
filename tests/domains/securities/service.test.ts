import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { listSecuritySymbols } from '@/domains/securities/service';
import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

const baseQuery = { includeEmerging: true, excludeKy: false, excludeFullDelivery: false, excludePreferredStock: false };

test('listSecuritySymbols: 沒有傳未支援的篩選時，warnings 應該是空的', async () => {
  const result = await listSecuritySymbols(baseQuery);
  assert.deepEqual(result.warnings, []);
});

test('listSecuritySymbols: excludeFullDelivery=true 應該回警告說明卡在資料源', async () => {
  const result = await listSecuritySymbols({ ...baseQuery, excludeFullDelivery: true });
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /資料源/);
});

test('listSecuritySymbols: excludePreferredStock=true 應該回警告說明沒有實際效果（不是缺資料源）', async () => {
  const result = await listSecuritySymbols({ ...baseQuery, excludePreferredStock: true });
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /沒有實際效果/);
  // 特別股本來就不在清單裡，這個參數不該影響清單內容本身。
  const baseline = await listSecuritySymbols(baseQuery);
  assert.deepEqual(result.symbols, baseline.symbols);
});

after(async () => {
  await twsePrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
