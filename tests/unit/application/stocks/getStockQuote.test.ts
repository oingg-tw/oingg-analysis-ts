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

const market = (latest: { tradeDate: Date; close: number | null } | null, batch: Map<string, { tradeDate: Date; close: number | null }> = new Map()): Pick<MarketDataPort, 'getLatestDailyPrice' | 'getLatestDailyPricesBatch'> => ({
  getLatestDailyPrice: async () => latest,
  getLatestDailyPricesBatch: async () => batch,
});

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
    expect(await getStockPrices(['2330', '0000'], deps)).toEqual({ prices: { '2330': { close: 2385, tradeDate: '2026-09-15' } } });
  });
});
