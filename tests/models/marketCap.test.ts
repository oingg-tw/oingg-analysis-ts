import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getStockPriceAsOf } from '@/models/marketCap';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

// 2026-09-06 修正：daily_price 對每個交易日都會有一列，沒成交的那天 close 是 null（不是
// 沒有這一天的紀錄）。原本 getPriceRowAsOf 只抓「最新一列」，冷門股票好幾天沒成交時會直接
// 回傳 null，即使往前一兩天就有真實成交價——用特別股功能實測時發現的（1312A 國喬特
// 2026-09-02~09-04 連續三天沒成交，close 都是 null，但 2026-09-01 有真實收盤價 23）。

test('getStockPriceAsOf: 冷門股票某天沒成交（close=null）時，應該往前找到最近一筆真的有成交價的日期，不是直接回傳 null', async () => {
  // 1312A 已確認 2026-09-02/09-03/09-04 這三天 close 都是 null，2026-09-01 收盤價是 23——
  // 這是已經發生過的歷史資料，不會隨時間變動，斷言可以釘死。
  const result = await getStockPriceAsOf('1312A', new Date('2026-09-04T00:00:00.000Z'));
  assert.ok(result, '應該要能往前找到 2026-09-01 的真實收盤價，不是回傳 null');
  assert.equal(result!.tradeDate, '2026-09-01');
  assert.equal(result!.closePrice, 23);
});

test('getStockPriceAsOf: 查無此 symbol 應該回傳 null，不拋錯', async () => {
  const result = await getStockPriceAsOf('999999', new Date());
  assert.equal(result, null);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
