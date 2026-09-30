import { describe, expect, test } from 'vitest';
import { getSectorDividendSummary } from '@/application/industries/service';
import type { CompanyNameEntry, CompanyProfilePort } from '@/application/ports/companyProfiles';
import type { MetricValueQueryPort } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 2026-09-30 釘住母體規則：興櫃／無類股排除、殖利率只收最新交易日 14 天內、0（沒配息）照算。
const company = (symbol: string, over: Partial<CompanyNameEntry> = {}): CompanyNameEntry => ({ symbol, companyName: symbol, market: 'TWSE', sectorCode: '24', sectorName: '半導體業', isEmerging: false, ...over });

describe('getSectorDividendSummary', () => {
  test('興櫃與無類股不進母體；舊殖利率不計入、0 照算；成長率照收', async () => {
    let requested: string[] = [];
    const deps = createTestDeps({
      companyProfiles: {
        listAllCompanyNames: async () => ({ count: 6, entries: [company('A'), company('B'), company('C'), company('D'), company('E', { isEmerging: true }), company('F', { sectorCode: null, sectorName: null })] }),
      } as unknown as CompanyProfilePort,
      metricValueQueries: {
        values: async (symbols: string[]) => {
          requested = symbols;
          return [
            { symbol: 'A', v0: 4, k0: new Date('2026-09-30'), v1: 10 },
            { symbol: 'B', v0: 2, k0: new Date('2026-09-10'), v1: 20 }, // 20 天前：停牌，不算現況
            { symbol: 'C', v0: 0, k0: new Date('2026-09-30'), v1: null }, // 沒配息
            { symbol: 'D', v0: 6, k0: new Date('2026-09-17'), v1: 30 }, // 剛好 13 天內
          ];
        },
      } as unknown as MetricValueQueryPort,
    });

    const result = await getSectorDividendSummary(deps);
    expect(requested).toEqual(['A', 'B', 'C', 'D']);
    expect(result).toEqual({
      dividendYieldTradeDate: '2026-09-30',
      sectors: [{ sectorCode: '24', sectorName: '半導體業', companyCount: 4, dividendYield: { count: 3, mean: 3.33, median: 4 }, dividendGrowthRate3y: { count: 3, mean: 20, median: 20 } }],
    });
  });
});
