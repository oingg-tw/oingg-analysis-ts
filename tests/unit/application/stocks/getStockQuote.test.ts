import { describe, expect, test } from 'vitest';
import { getStockQuote, getStockPrices } from '@/application/stocks/service';
import type { CompanyProfilePort } from '@/application/ports/companyProfiles';
import type { MarketDataPort } from '@/application/ports/marketData';
import type { MetricValueQueryPort } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../fakes/createTestDeps';

// Phase 5 示範：HTTP 層的 use case 用 createTestDeps + 幾個 port 的物件字面值就能不連 DB 測——
// 這裡釘的是 GET /stocks/:symbol/quote 跟 bff-ts 對過的兩條規格：「公司不存在 → null（controller 轉 404）」跟
// 「公司存在但查無股價/估值 → 200 + 欄位 null」是兩種不同情境；估值三個指標各自獨立查、tradeDate 取任一筆有值的。

const companyProfiles = (exists: boolean): Pick<CompanyProfilePort, 'companyExists'> => ({ companyExists: async () => exists });

type Price = { tradeDate: Date; close: number | null };
const market = (
  latest: Price | null,
  batch: Map<string, Price> = new Map(),
  closes: Map<string, Price[]> = new Map(),
): Pick<MarketDataPort, 'getLatestDailyPrice' | 'getLatestDailyPricesBatch' | 'getRecentClosesBatch'> => ({
  getLatestDailyPrice: async () => latest,
  getLatestDailyPricesBatch: async () => batch,
  getRecentClosesBatch: async () => closes,
});
const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const snapshots = (values: Record<string, { tradeDate: Date; value: number | null } | null>): Pick<MetricValueQueryPort, 'findLatestSnapshotValue'> => ({
  findLatestSnapshotValue: async (_symbol, metricCode) => values[metricCode] ?? null,
});

describe('getStockQuote', () => {
  test('公司不存在 → null（不管股價/估值查不查得到）', async () => {
    const deps = createTestDeps({
      companyProfiles: companyProfiles(false) as CompanyProfilePort,
      market: market({ tradeDate: new Date('2026-09-15T00:00:00.000Z'), close: 2385 }) as MarketDataPort,
      metricValueQueries: snapshots({}) as MetricValueQueryPort,
    });
    expect(await getStockQuote('0000', deps)).toBeNull();
  });

  test('公司存在但查無股價與估值 → price/valuation 都是 null，不是整體 null', async () => {
    const deps = createTestDeps({
      companyProfiles: companyProfiles(true) as CompanyProfilePort,
      market: market(null) as MarketDataPort,
      metricValueQueries: snapshots({}) as MetricValueQueryPort,
    });
    expect(await getStockQuote('2330', deps)).toEqual({ symbol: '2330', price: null, valuation: null });
  });

  test('估值三個指標獨立查：peRatio 缺時 tradeDate 退到 pbRatio 那筆，缺的欄位是 null', async () => {
    const deps = createTestDeps({
      companyProfiles: companyProfiles(true) as CompanyProfilePort,
      market: market({ tradeDate: new Date('2026-09-15T00:00:00.000Z'), close: 2385 }) as MarketDataPort,
      metricValueQueries: snapshots({
        exchangePbRatio: { tradeDate: new Date('2026-09-12T00:00:00.000Z'), value: 8.9 },
        dividendYield: { tradeDate: new Date('2026-09-12T00:00:00.000Z'), value: 0.8 },
      }) as MetricValueQueryPort,
    });
    expect(await getStockQuote('2330', deps)).toEqual({
      symbol: '2330',
      price: { tradeDate: '2026-09-15', close: 2385 },
      valuation: { tradeDate: '2026-09-12', peRatio: null, pbRatio: 8.9, dividendYield: 0.8 },
    });
  });
});

describe('getStockPrices', () => {
  test('查不到的 symbol 直接不出現在 prices 裡，日期切成 YYYY-MM-DD', async () => {
    const deps = createTestDeps({
      market: market(null, new Map([['2330', { tradeDate: new Date('2026-09-15T00:00:00.000Z'), close: 2385 }]])) as MarketDataPort,
    });
    expect(await getStockPrices(['2330', '0000'], deps)).toEqual({
      prices: { '2330': { close: 2385, tradeDate: '2026-09-15', previousClose: null, previousTradeDate: null, latestClose: null, latestCloseDate: null } },
    });
  });

  // 2026-10-06 bff-ts 觀察清單：previousClose = tradeDate 之前最近一筆有成交的收盤價（兩市合併後的清單，新到舊）。
  test('previousClose：一般、前一天沒成交往前找、新掛牌 null、轉板跨市場', async () => {
    const deps = createTestDeps({
      market: market(
        null,
        new Map([
          ['2330', { tradeDate: day('2026-10-05'), close: 2575 }],
          ['2064', { tradeDate: day('2026-10-05'), close: null }], // 今天沒成交
          ['0099', { tradeDate: day('2026-10-05'), close: 15 }], // 新掛牌第一天
          ['8476', { tradeDate: day('2026-10-05'), close: 300 }], // 轉上市第一天，前一筆在上櫃
        ]),
        new Map([
          ['2330', [{ tradeDate: day('2026-10-05'), close: 2575 }, { tradeDate: day('2026-10-02'), close: 2550 }]],
          ['2064', [{ tradeDate: day('2026-09-23'), close: 40 }, { tradeDate: day('2026-09-22'), close: 41 }]],
          ['0099', [{ tradeDate: day('2026-10-05'), close: 15 }]],
          ['8476', [{ tradeDate: day('2026-10-05'), close: 300 }, { tradeDate: day('2026-10-02'), close: 290 }, { tradeDate: day('2026-10-01'), close: 285 }]],
        ]),
      ) as MarketDataPort,
    });
    const { prices } = await getStockPrices(['2330', '2064', '0099', '8476'], deps);
    expect(prices['2330']).toMatchObject({ previousClose: 2550, previousTradeDate: '2026-10-02' });
    expect(prices['2064']).toMatchObject({ close: null, previousClose: 40, previousTradeDate: '2026-09-23' });
    expect(prices['0099']).toMatchObject({ previousClose: null, previousTradeDate: null });
    expect(prices['8476']).toMatchObject({ previousClose: 290, previousTradeDate: '2026-10-02' });
    // 2026-10-07 latestClose：當天有成交＝close；當天沒成交往前找最後一個真的收盤價並給日期。
    expect(prices['2330']).toMatchObject({ latestClose: 2575, latestCloseDate: '2026-10-05' });
    expect(prices['2064']).toMatchObject({ close: null, latestClose: 40, latestCloseDate: '2026-09-23' });
  });
});
