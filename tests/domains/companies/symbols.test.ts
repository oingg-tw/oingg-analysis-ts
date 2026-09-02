import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAllRealCompanySymbols } from '@/shared/sourceData/companyProfile';
import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

test('getAllRealCompanySymbols: 應該包含 KY 股跟興櫃公司，排除 TWSE 非交易性質的登記資料', async () => {
  const symbols = await getAllRealCompanySymbols();

  assert.ok(symbols.includes('2330'), '2330（台積電）應該在清單裡');
  assert.ok(symbols.includes('2071'), '2071（震南鐵，興櫃）應該在清單裡——興櫃是合法登記的公司，不該被排除');
  assert.ok(!symbols.includes('000104'), '000104（臺銀證券，TWSE 非交易性質的證券商登記資料）不應該在清單裡');

  const kyRow = await twsePrisma.companyProfile.findFirst({ where: { shortName: { contains: '-KY' } }, select: { symbol: true } });
  if (kyRow) assert.ok(symbols.includes(kyRow.symbol), `${kyRow.symbol}（KY 股）應該在清單裡——這支端點是給資料串接用，不是前端排行榜，不排 KY`);
});

test('getAllRealCompanySymbols: 排序過、沒有重複', async () => {
  const symbols = await getAllRealCompanySymbols();
  const sorted = [...symbols].sort();
  assert.deepEqual(symbols, sorted);
  assert.equal(new Set(symbols).size, symbols.length);
});

after(async () => {
  await twsePrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
