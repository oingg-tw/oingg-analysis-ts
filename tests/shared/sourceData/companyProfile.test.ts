import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { listAllCompanyNames, countAllCompanyNames, listAllSecurityNames, countAllSecurityNames } from '@/shared/sourceData/companyProfile';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import sitcaExportPrisma from '@/adapters/prisma/sitcaExportClient';

// 2026-09-01 bff-ts 實測抓到 GET /companies 回應裡 7914/7932 這兩檔公司各自出現兩次（TWSE、
// TPEx 的 company_profile 剛好都有登記，資料內容一樣），害他們那邊 upsert 撞到「ON CONFLICT
// DO UPDATE 同一列被影響兩次」的錯誤——驗證去重後同一個 symbol 不會出現第二次。
test('listAllCompanyNames: 兩邊資料庫都有登記的公司代號，去重後只出現一次', async () => {
  const { entries } = await listAllCompanyNames(3000, 0);
  const symbolCounts = new Map<string, number>();
  for (const entry of entries) {
    symbolCounts.set(entry.symbol, (symbolCounts.get(entry.symbol) ?? 0) + 1);
  }
  const duplicated = [...symbolCounts.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(duplicated, [], `不應該有重複的 symbol：${JSON.stringify(duplicated)}`);
});

test('listAllCompanyNames: count 反映去重後的總筆數，不是 twse+tpex 筆數直接相加', async () => {
  const [twseCountRows, tpexCountRows, { count }] = await Promise.all([
    twseExportPrisma.$queryRaw<{ cnt: bigint }[]>`SELECT count(*)::bigint as cnt FROM "export"."company_profile"`,
    tpexExportPrisma.$queryRaw<{ cnt: bigint }[]>`SELECT count(*)::bigint as cnt FROM "export"."company_profile"`,
    listAllCompanyNames(1, 0),
  ]);
  const twseCount = Number(twseCountRows[0]?.cnt ?? 0);
  const tpexCount = Number(tpexCountRows[0]?.cnt ?? 0);
  assert.ok(count <= twseCount + tpexCount, '去重後的總筆數不該超過兩邊直接相加');
});

test('listAllCompanyNames: limit/offset 正確切頁，不重複不遺漏', async () => {
  const page1 = await listAllCompanyNames(10, 0);
  const page2 = await listAllCompanyNames(10, 10);
  const page1Ids = page1.entries.map((e) => e.symbol);
  const page2Ids = page2.entries.map((e) => e.symbol);
  assert.equal(page1.entries.length, 10);
  assert.equal(page2.entries.length, 10);
  assert.deepEqual(page1Ids.filter((id) => page2Ids.includes(id)), [], '兩頁不應該有重複的 symbol');
});

test('countAllCompanyNames 應該跟 listAllCompanyNames 回傳的 count 一致', async () => {
  const [count, { count: countFromList }] = await Promise.all([countAllCompanyNames(), listAllCompanyNames(1, 0)]);
  assert.equal(count, countFromList);
});

// 2026-09-11 應 web-nuxt 要求新增——GET /securities（listAllSecurityNames），跟
// GET /companies（listAllCompanyNames）刻意分開的「證券」範疇，重用 getAllSecurityRows，
// 主要差異是要真的涵蓋特別股（company_profile 結構性不含）。

test('listAllSecurityNames: 涵蓋特別股（2891B/1101B），type=PREFERRED，listAllCompanyNames 不涵蓋', async () => {
  const { entries } = await listAllSecurityNames(5000, 0);
  const bySymbol = new Map(entries.map((e) => [e.symbol, e]));
  assert.equal(bySymbol.get('2891B')?.type, 'PREFERRED', '2891B（中信金乙特）type 應該是 PREFERRED');
  assert.equal(bySymbol.get('1101B')?.type, 'PREFERRED', '1101B（台泥乙特）type 應該是 PREFERRED');

  const { entries: companyEntries } = await listAllCompanyNames(5000, 0);
  const companySymbols = new Set(companyEntries.map((e) => e.symbol));
  assert.ok(!companySymbols.has('2891B'), '2891B 不應該出現在 GET /companies 的公司清單裡（company_profile 結構性不含特別股）');
});

test('listAllSecurityNames: 涵蓋 ETF（00919），type=ETF，listAllCompanyNames 不涵蓋', async () => {
  const { entries } = await listAllSecurityNames(5000, 0);
  const entry = entries.find((e) => e.symbol === '00919');
  assert.ok(entry, '00919（群益台灣精選高息）應該出現在證券清單裡');
  assert.ok(entry!.companyName, 'ETF 應該要有名稱，不是 null');
  assert.equal(entry!.type, 'ETF');

  const { entries: companyEntries } = await listAllCompanyNames(5000, 0);
  const companySymbols = new Set(companyEntries.map((e) => e.symbol));
  assert.ok(!companySymbols.has('00919'), '00919 不應該出現在 GET /companies 的公司清單裡（ETF 是 sitca-ts 的基金產品，不是 company_profile 範疇）');
});

test('listAllSecurityNames: 一般股票（2330）type=COMMON', async () => {
  const { entries } = await listAllSecurityNames(5000, 0);
  const entry = entries.find((e) => e.symbol === '2330');
  assert.ok(entry);
  assert.equal(entry!.type, 'COMMON');
});

test('listAllSecurityNames: 去重後同一個 symbol 不會出現第二次', async () => {
  const { entries } = await listAllSecurityNames(5000, 0);
  const symbolCounts = new Map<string, number>();
  for (const entry of entries) {
    symbolCounts.set(entry.symbol, (symbolCounts.get(entry.symbol) ?? 0) + 1);
  }
  const duplicated = [...symbolCounts.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(duplicated, [], `不應該有重複的 symbol：${JSON.stringify(duplicated)}`);
});

test('countAllSecurityNames 應該跟 listAllSecurityNames 回傳的 count 一致', async () => {
  const [count, { count: countFromList }] = await Promise.all([countAllSecurityNames(), listAllSecurityNames(1, 0)]);
  assert.equal(count, countFromList);
});

test('listAllSecurityNames: limit/offset 正確切頁，不重複不遺漏', async () => {
  const page1 = await listAllSecurityNames(10, 0);
  const page2 = await listAllSecurityNames(10, 10);
  const page1Ids = page1.entries.map((e) => e.symbol);
  const page2Ids = page2.entries.map((e) => e.symbol);
  assert.equal(page1.entries.length, 10);
  assert.equal(page2.entries.length, 10);
  assert.deepEqual(page1Ids.filter((id) => page2Ids.includes(id)), [], '兩頁不應該有重複的 symbol');
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
  await sitcaExportPrisma.$disconnect();
});
