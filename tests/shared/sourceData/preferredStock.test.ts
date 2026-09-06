import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getPreferredStockSecurities, getLatestPreferredStockRight } from '@/shared/sourceData/preferredStock';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

// 全新的特別股功能——跟 2026-09-06 規劃時直接查 export DB 驗證過的真實資料交叉驗證。

test('getPreferredStockSecurities: 應該回傳目前上市中的特別股清單，包含 1101B 台泥乙特', async () => {
  const securities = await getPreferredStockSecurities();
  assert.ok(securities.length >= 20, `目前應該有約 28 檔上市中的特別股，實際 ${securities.length} 檔`);

  const taiCement = securities.find((s) => s.symbol === '1101B');
  assert.ok(taiCement, '應該找得到 1101B');
  assert.equal(taiCement!.name, '台泥乙特');
  assert.equal(taiCement!.marketType, '上市');
});

test('getLatestPreferredStockRight: 1101B 的發行條款應該跟實測驗證過的真實數字一致', async () => {
  const right = await getLatestPreferredStockRight('1101B');
  assert.ok(right);
  assert.equal(right!.issuePrice, 50);
  assert.equal(right!.dividendRate, 1.75);
});

test('getLatestPreferredStockRight: 2887F 有多次配息條件修訂（series_no），應該回傳最新一次（series_no=3），不是最舊的', async () => {
  // 2026-09-06 規劃時確認過：2887F series_no=1/2 的 dividend_rate 都是 1.9，series_no=3
  // 才改成 2.296——如果查詢邏輯漏了 ORDER BY series_no DESC，會拿到舊的 1.9。
  const right = await getLatestPreferredStockRight('2887F');
  assert.ok(right);
  assert.equal(right!.dividendRate, 2.296, '應該拿到最新修訂（series_no=3）的配息金額，不是舊系列的 1.9');
});

test('getLatestPreferredStockRight: 查無此 preferred_stock_code 應該回傳 null，不拋錯', async () => {
  const right = await getLatestPreferredStockRight('9999Z');
  assert.equal(right, null);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
  await mopsExportPrisma.$disconnect();
});
