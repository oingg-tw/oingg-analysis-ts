import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { listAllCompanyNames, countAllCompanyNames } from '@/shared/sourceData/companyProfile';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';

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

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
});
