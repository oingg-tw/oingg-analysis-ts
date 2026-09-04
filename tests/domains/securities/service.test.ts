import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { listSecuritySymbols } from '@/domainApi/securities/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

const baseQuery = { includeEmerging: true, excludeKy: false, excludeFullDelivery: false };

test('listSecuritySymbols: 沒有傳未支援的篩選時，warnings 應該是空的', async () => {
  const result = await listSecuritySymbols(baseQuery);
  assert.deepEqual(result.warnings, []);
});

// 2026-09-04 接上實際篩選邏輯——直接查真實 changed_trading_method 資料交叉比對，確認
// excludeFullDelivery=true 排除掉的就是「當下最新 trade_date 有出現在這張表」（TWSE）
// 或「altered_trading=true」（TPEx）的股票，不是巧合對上或漏篩。
test('listSecuritySymbols: excludeFullDelivery=true 應該排除掉真正的全額交割股，不再回警告', async () => {
  const [withoutExclusion, withExclusion] = await Promise.all([
    listSecuritySymbols(baseQuery),
    listSecuritySymbols({ ...baseQuery, excludeFullDelivery: true }),
  ]);
  assert.deepEqual(withExclusion.warnings, [], '排除邏輯已經接上，不應該再有警告');
  assert.ok(withExclusion.symbols.length < withoutExclusion.symbols.length, '排除後的清單應該比原本少');

  const [twseFullDelivery, tpexFullDelivery] = await Promise.all([
    twseExportPrisma.$queryRaw<{ symbol: string }[]>`
      SELECT DISTINCT symbol FROM "export"."changed_trading_method"
      WHERE trade_date = (SELECT MAX(trade_date) FROM "export"."changed_trading_method")
    `,
    tpexExportPrisma.$queryRaw<{ symbol: string }[]>`
      SELECT DISTINCT symbol FROM "export"."changed_trading_method"
      WHERE trade_date = (SELECT MAX(trade_date) FROM "export"."changed_trading_method") AND altered_trading = true
    `,
  ]);
  const knownFullDeliverySymbols = new Set([...twseFullDelivery.map((r) => r.symbol), ...tpexFullDelivery.map((r) => r.symbol)]);
  assert.ok(knownFullDeliverySymbols.size > 0, '真實資料裡應該至少有幾檔全額交割股，測試才有意義');

  const excludedSet = new Set(withExclusion.symbols);
  for (const symbol of knownFullDeliverySymbols) {
    if (withoutExclusion.symbols.includes(symbol)) {
      assert.ok(!excludedSet.has(symbol), `${symbol} 是全額交割股，excludeFullDelivery=true 時不應該出現`);
    }
  }
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
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
