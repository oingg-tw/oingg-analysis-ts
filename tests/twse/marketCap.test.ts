import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';

// `company_profile` 這張表 2026-08-21 才發現存在（prisma/twse/schema.prisma 開頭註解沒提到，
// 是舊的），還沒鏡像進 schema，這裡先用 raw query 驗證欄位名稱／join 邏輯，是之後要做
// PSR/P_FCF/EV_EBITDA/Altman Z-Score（市值 = daily_price.close x company_profile.issued_shares）
// 的地基。改走 twse-ts 的 export schema 之後，daily_price/company_profile 兩張 view 的欄位都是
// snake_case（trade_date、issued_shares），不再是原本 owner 連線那種 daily_price camelCase、
// company_profile snake_case 混雜的情況，raw SQL 統一用 snake_case。
//
// 不斷言確切數字（股價每天變、company_profile 未來鏡像進 schema 後 issued_shares 也可能更新），
// 只斷言查詢跑得動、join 得到合理筆數、算出來的市值數量級正確（不是 0、不是負數）。

interface MarketCapRow {
  symbol: string;
  market_cap: bigint | null;
}

test('company_profile join daily_price 可以正確算出市值（單一公司，2330）', async () => {
  const rows = await twseExportPrisma.$queryRaw<MarketCapRow[]>`
    SELECT dp.close * cp.issued_shares AS market_cap
    FROM "export"."daily_price" dp
    JOIN "export"."company_profile" cp ON cp.symbol = dp.symbol
    WHERE dp.symbol = '2330'
    ORDER BY dp.trade_date DESC
    LIMIT 1
  `;

  assert.equal(rows.length, 1);
  const marketCap = rows[0]!.market_cap;
  assert.ok(marketCap !== null, '2330 應該要能算出市值');
  // 台積電市值數量級是十兆等級（NTD），用寬鬆區間避免每天股價變動就讓測試炸掉。
  assert.ok(marketCap! > 1_000_000_000_000n, `市值 ${marketCap} 數量級太小，可能算錯或抓錯欄位`);
  assert.ok(marketCap! < 500_000_000_000_000n, `市值 ${marketCap} 數量級太大，可能算錯或抓錯欄位`);
});

test('company_profile join daily_price 可以查到大量公司的市值（不限定單一天）', async () => {
  // 故意不限定「最新一天」——實測過程中發現 daily_price 的最新交易日（當時是 2026-08-21）
  // 只有 1 檔股票有資料，其他都還沒 ingest 進來（oingg-twse 那邊的每日 ingest job 還在跑，
  // 不是本服務能控制的時間點），如果斷言「最新一天要有 1000+ 檔」，剛好卡到 ingest 還沒跑完
  // 的時間點測試就會失敗，但這不代表 join 邏輯寫錯。改成不分日期，看「曾經」join 到的公司數，
  // 這樣測的是 schema/join 本身對不對，不會受 ingest 進度影響。
  const rows = await twseExportPrisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(DISTINCT dp.symbol) as cnt
    FROM "export"."daily_price" dp
    JOIN "export"."company_profile" cp ON cp.symbol = dp.symbol
    WHERE dp.close IS NOT NULL
      AND cp.issued_shares IS NOT NULL
  `;

  const distinctSymbols = Number(rows[0]!.cnt);
  assert.ok(distinctSymbols > 1000, `join 到的公司數 ${distinctSymbols} 太少，可能是 join 條件寫錯`);
});

afterAll(async () => {
  await twseExportPrisma.$disconnect();
});
