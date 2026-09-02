import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { listSecuritySymbols } from '@/domains/securities/service';
import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

const baseQuery = { includeEmerging: true, excludeKy: false, excludeFullDelivery: false };

test('listSecuritySymbols: 沒有傳未支援的篩選時，warnings 應該是空的', async () => {
  const result = await listSecuritySymbols(baseQuery);
  assert.deepEqual(result.warnings, []);
});

test('listSecuritySymbols: excludeFullDelivery=true 應該回警告說明卡在資料源', async () => {
  const result = await listSecuritySymbols({ ...baseQuery, excludeFullDelivery: true });
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /資料源/);
});

test('listSecuritySymbols: preferredStock=only 應該回傳特別股，不需要警告', async () => {
  const result = await listSecuritySymbols({ ...baseQuery, preferredStock: 'only' });
  assert.deepEqual(result.warnings, []);
  assert.ok(result.symbols.includes('1101B'), '1101B（台泥乙特）應該在清單裡');
});

test('listSecuritySymbols: market=TPEx + preferredStock=only 應該回空清單並附警告說明資料源限制', async () => {
  const result = await listSecuritySymbols({ ...baseQuery, market: 'TPEx', preferredStock: 'only' });
  assert.deepEqual(result.symbols, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /只有 TWSE/);
});

after(async () => {
  await twsePrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
