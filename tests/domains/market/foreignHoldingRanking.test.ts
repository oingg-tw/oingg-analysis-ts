import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { calculateForeignHoldingRanking } from '@/domainApi/market/foreignHoldingRanking/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

interface DistinctTradeDateRow {
  trade_date: Date;
}

// foreign_holding 每天都在回補，目前(2026-09-01)只有一天資料，兩天才能比較變動——這裡不寫死
// 假設一定有兩天資料，跟本服務其他吃即時市場資料的測試同一種風格（現查、不夠就跳過驗證細節，
// 但至少驗證「資料不足時要優雅降級，不是拋錯」這件事本身）。
test('calculateForeignHoldingRanking: 資料不足兩個交易日時優雅降級，不拋錯', async () => {
  const distinctDates = await twseExportPrisma.$queryRaw<DistinctTradeDateRow[]>`
    SELECT DISTINCT trade_date FROM "export"."foreign_holding"
  `;
  if (distinctDates.length >= 2) return; // 已經有兩天以上資料，這個「資料不足」案例驗證不到，跳過。

  const result = await calculateForeignHoldingRanking({ limit: 10 });
  assert.deepEqual(result.increases, []);
  assert.deepEqual(result.decreases, []);
  assert.ok(result.warnings.length > 0);
});

test('calculateForeignHoldingRanking: 有兩天以上資料時，加碼/減碼排行應該符合排序跟固定筆數邏輯', async () => {
  const distinctDates = await twseExportPrisma.$queryRaw<DistinctTradeDateRow[]>`
    SELECT DISTINCT trade_date FROM "export"."foreign_holding"
  `;
  if (distinctDates.length < 2) return; // 資料還不足兩天，這個案例驗證不到，跳過（見上一個測試）。

  const result = await calculateForeignHoldingRanking({ limit: 10 });
  assert.ok(result.tradeDate !== '');
  assert.ok(result.eligibleCompanyCount > 0);

  for (let i = 1; i < result.increases.length; i++) {
    assert.ok(result.increases[i - 1]!.changePercentagePoints >= result.increases[i]!.changePercentagePoints, '加碼排行應該由大到小');
  }
  for (let i = 1; i < result.decreases.length; i++) {
    assert.ok(result.decreases[i - 1]!.changePercentagePoints <= result.decreases[i]!.changePercentagePoints, '減碼排行應該由小到大（減最多排最前面）');
  }
  for (const row of [...result.increases, ...result.decreases]) {
    const expected = Math.round((row.sharesHeldPercent - row.previousSharesHeldPercent) * 100) / 100;
    assert.equal(row.changePercentagePoints, expected, 'changePercentagePoints 應該等於今天減昨天');
  }

  assert.equal(result.increases.length, Math.min(10, result.eligibleCompanyCount));
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
