import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { getMonthlyRevenueHistory } from '@/infrastructure/repositories/twse/monthlyRevenue';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';

// 2330 月營收——2026-09-23 起讀 twse-ts PROD（先前讀 DEV 庫的一次性樣本，只有 2330 之類少數公司有資料，
// 起訖是 2021-08~2026-07；PROD 完成上市全市場回填後是 2021-09~2026-08 共 60 個月、993 家）。
// 下面的數字是換源後從 PROD 取的真實值。momChangePercent 是本服務自己用相鄰兩個月的 currentMonthRevenue
// 反推的（來源沒有這個欄位），這裡手動核算過交叉驗證。

test('getMonthlyRevenueHistory: 2330 應該有完整 60 個月資料，由舊到新排序', async () => {
  const result = await getMonthlyRevenueHistory('2330', 60);

  assert.equal(result.total, 60);
  assert.equal(result.hasMore, false);
  assert.equal(result.entries.length, 60);
  assert.equal(result.entries[0]!.yearMonth, '2021-09', '第一筆應該是最舊的月份');
  assert.equal(result.entries[59]!.yearMonth, '2026-08', '最後一筆應該是最新的月份');
});

test('getMonthlyRevenueHistory: 最舊一筆（沒有更早的月份可比較）momChangePercent 應該是 null', async () => {
  const result = await getMonthlyRevenueHistory('2330', 60);
  const oldest = result.entries[0]!;

  assert.equal(oldest.yearMonth, '2021-09');
  assert.equal(oldest.momChangePercent, null);
  assert.equal(oldest.currentMonthRevenue, '152685418');
  assert.equal(oldest.yoyChangePercent, 19.67, 'yoyChangePercent 是來源直接算好的欄位，原樣透傳');
});

test('getMonthlyRevenueHistory: momChangePercent 手動核算過的真實數字交叉驗證', async () => {
  const result = await getMonthlyRevenueHistory('2330', 60);
  const oct2021 = result.entries.find((e) => e.yearMonth === '2021-10');

  assert.ok(oct2021);
  // (134539477-152685418)/152685418*100 = -11.884...% 四捨五入到 -11.88
  assert.equal(oct2021!.currentMonthRevenue, '134539477');
  assert.equal(oct2021!.momChangePercent, -11.88);
});

test('getMonthlyRevenueHistory: limit 小於總月數時，momChangePercent 仍然用完整資料反推（不受 limit 影響）', async () => {
  const limited = await getMonthlyRevenueHistory('2330', 5);

  assert.equal(limited.total, 60);
  assert.equal(limited.hasMore, true);
  assert.equal(limited.entries.length, 5);
  assert.equal(limited.entries[0]!.yearMonth, '2026-04');
  // 2026-04 是 limit=5 切出來範圍裡最舊的一筆，但往前還有 2026-03 可以比較，
  // momChangePercent 不應該因為被 limit 切到範圍邊界就變成 null。
  assert.notEqual(limited.entries[0]!.momChangePercent, null);
});

test('getMonthlyRevenueHistory: 查無資料的公司應該回傳空陣列，不是拋錯', async () => {
  const result = await getMonthlyRevenueHistory('9999', 60);

  assert.deepEqual(result.entries, []);
  assert.equal(result.total, 0);
  assert.equal(result.hasMore, false);
});

// 同一張表還有 MONTHLY_REVENUE_PUBLIC（公開發行未上市的證券商，2026-07 起）。沒有篩 source 的話
// 000104 這類六碼代號會混進來——這正是 2026-09-23 修掉的 bug，用實際受影響的代號釘住，避免回歸。
test('getMonthlyRevenueHistory: 公開發行未上市的公司不該出現（source 必須篩成上市）', async () => {
  const result = await getMonthlyRevenueHistory('000104', 60);

  assert.deepEqual(result.entries, []);
  assert.equal(result.total, 0);
});

// 2026-09-23 同日補上的上櫃 fallback：在那之前這支只查 twse，上櫃公司一律回空陣列。
// 6488 環球晶的 2026-08 營收 4,764,363 千元跟 tpex-ts 的抽驗一致。
test('getMonthlyRevenueHistory: 上櫃公司也要查得到（先查上市、空了再查上櫃）', async () => {
  const result = await getMonthlyRevenueHistory('6488', 60);

  assert.equal(result.total, 60);
  assert.equal(result.entries[0]!.yearMonth, '2021-09');
  assert.equal(result.entries[59]!.yearMonth, '2026-08');
  assert.equal(result.entries[59]!.currentMonthRevenue, '4764363');
  assert.equal(result.entries[59]!.industry, '半導體業');
});

// 上櫃歷史列的 report_date 是 NULL——來源頁面的「出表日期」是網頁重新產生的日期不是當年申報日，
// tpex-ts 選擇誠實留空。這裡釘住「是 null 而不是被填了一個假日期」。
test('getMonthlyRevenueHistory: 上櫃歷史月份的 reportDate 是 null，不是假的申報日', async () => {
  const result = await getMonthlyRevenueHistory('6488', 60);

  assert.equal(result.entries[59]!.reportDate, null);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
