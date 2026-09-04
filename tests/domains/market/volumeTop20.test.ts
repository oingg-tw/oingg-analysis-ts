import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getVolumeTop20 } from '@/api/bff/market/volumeTop20/service';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

// 這支端點刻意不排除 ETF/衍生性商品（跟本服務其他排行不一樣，2026-09-01 應使用者要求維持
// twse-ts 官方原始排名），所以這裡不驗證 ETF 排除，只驗證排名本身的完整性跟一致性。
test('getVolumeTop20: 應該依 rank 由小到大排序，且沒有跳號', async () => {
  const result = await getVolumeTop20();
  assert.ok(result.tradeDate !== '', '應該找得到最新一個交易日');
  assert.ok(result.rankings.length > 0, '應該至少有資料');

  for (let i = 1; i < result.rankings.length; i++) {
    assert.ok(result.rankings[i - 1]!.rank < result.rankings[i]!.rank, 'rank 應該遞增');
  }
  for (const row of result.rankings) {
    assert.ok(Number(row.volume) > 0, '成交量排行的成交量應該大於 0');
  }
});

test('getVolumeTop20: changePercent 有值時應該落在合理範圍內（沒有離譜的計算錯誤）', async () => {
  const result = await getVolumeTop20();
  for (const row of result.rankings) {
    if (row.changePercent === null) continue;
    assert.ok(Math.abs(row.changePercent) < 50, `${row.symbol} 的 changePercent (${row.changePercent}) 超出合理範圍`);
  }
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
