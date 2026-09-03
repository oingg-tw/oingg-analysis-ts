import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getCumulativeChangePercent, cumulativeChangePercentKey } from '@/shared/sourceData/priceChange';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

interface DistinctTradeDateRow {
  trade_date: Date;
}

interface CloseRow {
  close: unknown;
}

test('getCumulativeChangePercent: TWSE 2330 應該等於最新收盤跟往前6個交易日收盤的點對點漲跌幅', async () => {
  // 交易日曆要跟 src/shared/sourceData/priceChange.ts 的實際演算法一致——查 daily_taiex_index
  // （PK 是 tradeDate，就是官方交易日曆），不是對 daily_price 查 DISTINCT trade_date。
  // 2026-09-03 實測發現 daily_price 偶爾會有非交易日的雜訊列（例如 2330 在 2026-08-31 這種
  // 週末有一筆資料），用 daily_price 自建交易日清單會跟正式演算法的基準日對不上，算出不同的
  // base/latest 交易日，導致預期值跟實際值不一致——不是計算邏輯錯，是這裡的 ground truth 查詢
  // 本身用錯了交易日曆來源。
  const dates = await twseExportPrisma.$queryRaw<DistinctTradeDateRow[]>`
    SELECT trade_date FROM "export"."daily_taiex_index"
    ORDER BY trade_date DESC
    LIMIT 7
  `;
  if (dates.length < 7) return; // 資料不足7個交易日，這個案例驗證不到，跳過。

  const asOfDate = dates[0]!.trade_date;
  const baseDate = dates[6]!.trade_date;
  const [latestRows, baseRows] = await Promise.all([
    twseExportPrisma.$queryRaw<CloseRow[]>`SELECT close FROM "export"."daily_price" WHERE symbol = '2330' AND trade_date = ${asOfDate} LIMIT 1`,
    twseExportPrisma.$queryRaw<CloseRow[]>`SELECT close FROM "export"."daily_price" WHERE symbol = '2330' AND trade_date = ${baseDate} LIMIT 1`,
  ]);
  const latestRow = latestRows[0];
  const baseRow = baseRows[0];
  if (latestRow?.close == null || baseRow?.close == null) return; // 收盤價缺值，跳過。

  const expected = Math.round(((Number(latestRow.close) - Number(baseRow.close)) / Number(baseRow.close)) * 100 * 100) / 100;

  const result = await getCumulativeChangePercent([{ symbol: '2330', market: 'TWSE', asOfDate }], 6);
  assert.equal(result.get(cumulativeChangePercentKey('TWSE', '2330', asOfDate)), expected);
});

test('getCumulativeChangePercent: 資料不足6個交易日時回傳 null，不拋錯', async () => {
  const result = await getCumulativeChangePercent([{ symbol: '2330', market: 'TWSE', asOfDate: new Date('1990-01-01') }], 6);
  assert.equal(result.get(cumulativeChangePercentKey('TWSE', '2330', new Date('1990-01-01'))), null);
});

test('getCumulativeChangePercent: 查無資料的 symbol 也回傳 null，不影響其他 symbol', async () => {
  const dates = await twseExportPrisma.$queryRaw<DistinctTradeDateRow[]>`
    SELECT DISTINCT trade_date FROM "export"."daily_price" ORDER BY trade_date DESC LIMIT 1
  `;
  if (dates.length === 0) return;
  const asOfDate = dates[0]!.trade_date;

  const result = await getCumulativeChangePercent([{ symbol: '__NOT_A_REAL_SYMBOL__', market: 'TWSE', asOfDate }], 6);
  assert.equal(result.get(cumulativeChangePercentKey('TWSE', '__NOT_A_REAL_SYMBOL__', asOfDate)), null);
});

after(async () => {
  await twseExportPrisma.$disconnect();
});
