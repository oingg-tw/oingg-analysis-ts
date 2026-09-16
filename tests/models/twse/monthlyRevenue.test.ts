import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getMonthlyRevenueHistory } from '@/models/twse/monthlyRevenue';
import { twseExportDevPrisma } from '@/infrastructure/prisma/twseExportDevClient';

// 2330 月營收——twse-ts 2026-09-07 一次性手動回填，2021-08~2026-07 共 60 個月，只有
// 這一檔公司有資料（見 twseExportDevClient.ts 的完整說明）。momChangePercent 是本服務
// 自己用相鄰兩個月的 currentMonthRevenue 反推的（來源沒有這個欄位），這裡用真實數字
// 手動核算過交叉驗證。

test('getMonthlyRevenueHistory: 2330 應該有完整 60 個月資料，由舊到新排序', async () => {
  const result = await getMonthlyRevenueHistory('2330', 60);

  assert.equal(result.total, 60);
  assert.equal(result.hasMore, false);
  assert.equal(result.entries.length, 60);
  assert.equal(result.entries[0]!.yearMonth, '2021-08', '第一筆應該是最舊的月份');
  assert.equal(result.entries[59]!.yearMonth, '2026-07', '最後一筆應該是最新的月份');
});

test('getMonthlyRevenueHistory: 最舊一筆（沒有更早的月份可比較）momChangePercent 應該是 null', async () => {
  const result = await getMonthlyRevenueHistory('2330', 60);
  const oldest = result.entries[0]!;

  assert.equal(oldest.yearMonth, '2021-08');
  assert.equal(oldest.momChangePercent, null);
  assert.equal(oldest.currentMonthRevenue, '137427162');
  assert.equal(oldest.yoyChangePercent, 11.84, 'yoyChangePercent 是來源直接算好的欄位，原樣透傳');
});

test('getMonthlyRevenueHistory: momChangePercent 手動核算過的真實數字交叉驗證', async () => {
  const result = await getMonthlyRevenueHistory('2330', 60);
  const sep2021 = result.entries.find((e) => e.yearMonth === '2021-09');

  assert.ok(sep2021);
  // (152685418-137427162)/137427162*100 = 11.104...% 四捨五入到 11.1
  assert.equal(sep2021!.currentMonthRevenue, '152685418');
  assert.equal(sep2021!.momChangePercent, 11.1);
});

test('getMonthlyRevenueHistory: limit 小於總月數時，momChangePercent 仍然用完整資料反推（不受 limit 影響）', async () => {
  const limited = await getMonthlyRevenueHistory('2330', 5);

  assert.equal(limited.total, 60);
  assert.equal(limited.hasMore, true);
  assert.equal(limited.entries.length, 5);
  assert.equal(limited.entries[0]!.yearMonth, '2026-03');
  // 2026-03 是 limit=5 切出來範圍裡最舊的一筆，但往前還有 2026-02 可以比較，
  // momChangePercent 不應該因為被 limit 切到範圍邊界就變成 null。
  assert.notEqual(limited.entries[0]!.momChangePercent, null);
});

test('getMonthlyRevenueHistory: 查無資料的公司應該回傳空陣列，不是拋錯', async () => {
  const result = await getMonthlyRevenueHistory('9999', 60);

  assert.deepEqual(result.entries, []);
  assert.equal(result.total, 0);
  assert.equal(result.hasMore, false);
});

afterAll(async () => {
  await twseExportDevPrisma.$disconnect();
});
