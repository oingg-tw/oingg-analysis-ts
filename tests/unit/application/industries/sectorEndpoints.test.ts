import { describe, expect, test } from 'vitest';
import { getSectorMetricHistory, getSectorSummary } from '@/application/industries/service';
import type { CompanyNameEntry, CompanyProfilePort } from '@/application/ports/companyProfiles';
import type { MetricValueQueryPort } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 2026-10-09 類股三支端點：母體排除興櫃、限制季報型非每股類、查無類股 404、sector-summary 欄位 key 用請求字串。
const company = (symbol: string, over: Partial<CompanyNameEntry> = {}): CompanyNameEntry => ({ symbol, companyName: symbol, market: 'TWSE', sectorCode: '24', sectorName: '半導體業', isEmerging: false, ...over });
const profiles = {
  listAllCompanyNames: async () => ({ count: 4, entries: [company('A'), company('B'), company('E', { isEmerging: true }), company('X', { sectorCode: '17', sectorName: '金融保險業' })] }),
} as unknown as CompanyProfilePort;

describe('getSectorMetricHistory', () => {
  test('只查該類股的上市櫃公司（排除興櫃），取最近 limit 期、由舊到新', async () => {
    let requested: string[] = [];
    const deps = createTestDeps({
      companyProfiles: profiles,
      metricValueQueries: {
        listPeriodValuesForSymbols: async (symbols: string[]) => {
          requested = symbols;
          return [
            { symbol: 'A', fiscalYear: 2026, fiscalQuarter: 2, value: '40.5', nullReason: null },
            { symbol: 'B', fiscalYear: 2026, fiscalQuarter: 2, value: '30.5', nullReason: null },
            { symbol: 'A', fiscalYear: 2026, fiscalQuarter: 1, value: '20', nullReason: null },
            { symbol: 'A', fiscalYear: 2025, fiscalQuarter: 4, value: '10', nullReason: null },
          ];
        },
      } as unknown as MetricValueQueryPort,
    });
    const result = await getSectorMetricHistory({ sectorCode: '24', metricCode: 'grossMargin', timeframe: 'TTM', limit: 2 }, deps);
    expect(requested).toEqual(['A', 'B']);
    expect(result.sectorName).toBe('半導體業');
    expect(result.entries.map((e) => [e.fiscalYear, e.fiscalQuarter, e.median, e.count])).toEqual([
      [2026, 1, 20, 1],
      [2026, 2, 35.5, 2],
    ]);
  });

  test('每股類、逐日型指標 400；查無類股 404', async () => {
    const deps = createTestDeps({ companyProfiles: profiles });
    await expect(getSectorMetricHistory({ sectorCode: '24', metricCode: 'eps', timeframe: 'TTM', limit: 20 }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(getSectorMetricHistory({ sectorCode: '24', metricCode: 'dividendYield', timeframe: 'EOD', limit: 20 }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(getSectorMetricHistory({ sectorCode: '99', metricCode: 'roe', timeframe: 'TTM', limit: 20 }, deps)).rejects.toMatchObject({ status: 404 });
  });
});

describe('getSectorSummary', () => {
  test('每個類股每個欄位一組四分位，key 是請求的欄位字串', async () => {
    const deps = createTestDeps({
      companyProfiles: profiles,
      metricValueQueries: {
        values: async () => [
          { symbol: 'A', v0: 10, v1: null },
          { symbol: 'B', v0: 20, v1: 5 },
          { symbol: 'X', v0: 1, v1: 2 },
        ],
      } as unknown as MetricValueQueryPort,
    });
    const result = await getSectorSummary({ fields: 'revenueGrowthRate.TTM, netIncomeGrowthRate.TTM' }, deps);
    expect(result.sectors).toEqual([
      { sectorCode: '17', sectorName: '金融保險業', companyCount: 1, fields: { 'revenueGrowthRate.TTM': { count: 1, median: 1, q1: 1, q3: 1 }, 'netIncomeGrowthRate.TTM': { count: 1, median: 2, q1: 2, q3: 2 } } },
      { sectorCode: '24', sectorName: '半導體業', companyCount: 2, fields: { 'revenueGrowthRate.TTM': { count: 2, median: 15, q1: 12.5, q3: 17.5 }, 'netIncomeGrowthRate.TTM': { count: 1, median: 5, q1: 5, q3: 5 } } },
    ]);
  });
});
