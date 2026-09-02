import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getSecuritySymbols } from '@/shared/sourceData/companyProfile';
import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

test('getSecuritySymbols: 預設值（含興櫃、不排 KY、股票+特別股都要）應該包含 KY 股/興櫃公司/特別股，排除 TWSE 非交易性質的登記資料', async () => {
  const symbols = await getSecuritySymbols({ includeEmerging: true, excludeKy: false });

  assert.ok(symbols.includes('2330'), '2330（台積電）應該在清單裡');
  assert.ok(symbols.includes('2071'), '2071（震南鐵，興櫃）應該在清單裡——興櫃是合法登記的公司，不該被排除');
  assert.ok(!symbols.includes('000104'), '000104（臺銀證券，TWSE 非交易性質的證券商登記資料）不應該在清單裡');
  assert.ok(symbols.includes('1101B'), '1101B（台泥乙特，特別股）不給 preferredStock 篩選時應該在清單裡');

  const kyRow = await twsePrisma.companyProfile.findFirst({ where: { shortName: { contains: '-KY' } }, select: { symbol: true } });
  if (kyRow) assert.ok(symbols.includes(kyRow.symbol), `${kyRow.symbol}（KY 股）預設不排除，應該在清單裡`);
});

test('getSecuritySymbols: preferredStock=only 應該只回傳特別股', async () => {
  const symbols = await getSecuritySymbols({ includeEmerging: true, excludeKy: false, preferredStock: 'only' });
  assert.ok(symbols.includes('1101B'), '1101B（台泥乙特）應該在清單裡');
  assert.ok(symbols.includes('1312A'), '1312A（國喬特）應該在清單裡');
  assert.ok(!symbols.includes('2330'), '2330（台積電，普通股）不應該出現');
});

test('getSecuritySymbols: preferredStock=exclude 應該排除特別股（結果應該跟不給這個參數以前的行為一樣）', async () => {
  const symbols = await getSecuritySymbols({ includeEmerging: true, excludeKy: false, preferredStock: 'exclude' });
  assert.ok(!symbols.includes('1101B'), '1101B（台泥乙特）應該被排除');
  assert.ok(symbols.includes('2330'), '2330（台積電，普通股）不受影響');
});

test('getSecuritySymbols: market=TPEx + preferredStock=only 目前一定回空清單（特別股資料源只有 TWSE）', async () => {
  const symbols = await getSecuritySymbols({ market: 'TPEx', includeEmerging: true, excludeKy: false, preferredStock: 'only' });
  assert.deepEqual(symbols, []);
});

test('getSecuritySymbols: includeEmerging=false 應該排除興櫃公司', async () => {
  const symbols = await getSecuritySymbols({ includeEmerging: false, excludeKy: false });
  assert.ok(!symbols.includes('2071'), '2071（震南鐵，興櫃）應該被排除');
  assert.ok(symbols.includes('2330'), '2330（台積電，一般上市）不受影響，應該還在');
});

test('getSecuritySymbols: excludeKy=true 應該排除 KY 股', async () => {
  const kyRow = await twsePrisma.companyProfile.findFirst({ where: { shortName: { contains: '-KY' } }, select: { symbol: true } });
  if (!kyRow) return; // 開發資料庫這次剛好沒有 KY 股，跳過（不是測試失敗）。

  const symbols = await getSecuritySymbols({ includeEmerging: true, excludeKy: true });
  assert.ok(!symbols.includes(kyRow.symbol), `${kyRow.symbol}（KY 股）應該被排除`);
});

test('getSecuritySymbols: market=TWSE 應該只回傳上市，不含上櫃', async () => {
  const symbols = await getSecuritySymbols({ market: 'TWSE', includeEmerging: true, excludeKy: false });
  assert.ok(symbols.includes('2330'), '2330 是 TWSE，應該在清單裡');
  assert.ok(!symbols.includes('8299'), '8299（群聯，TPEx）market=TWSE 時不應該出現');
});

test('getSecuritySymbols: 排序過、沒有重複', async () => {
  const symbols = await getSecuritySymbols({ includeEmerging: true, excludeKy: false });
  const sorted = [...symbols].sort();
  assert.deepEqual(symbols, sorted);
  assert.equal(new Set(symbols).size, symbols.length);
});

after(async () => {
  await twsePrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
