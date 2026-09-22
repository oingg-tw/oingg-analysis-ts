import { describe, expect, test } from 'vitest';
import { getCompanyMetricHistory, getCompanyMetricsHistory } from '@/application/companies/history';
import { fetchLatestMetricValue } from '@/application/metrics/shared/fetchLatestMetricValue';
import type { MetricValueQueryPort } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 2026-09-22：讀取端不再寫死 data_type '2'——每家公司的口徑由 ReportAvailabilityPort 決定（249 家只申報個體
// 報表的公司用 '1'）。釘住「port 回什麼、查詢就帶什麼」，三條主要讀取路徑各一次；createTestDeps 預設回 '2'，
// 這裡刻意覆寫成 '1' 才看得出有沒有真的經過 port。

const seen: string[] = [];
const deps = createTestDeps({
  reportAvailability: { resolveDataType: async (symbol) => (symbol === '5863' ? '1' : '2') },
  metricValueQueries: {
    listPeriodMetricHistoryRows: async (_s: string, _m: string, _p: string, dataType: string) => (seen.push(dataType), []),
  } as unknown as MetricValueQueryPort,
});

describe('讀取端的 data_type 由 ReportAvailabilityPort 決定', () => {
  test('metric-history / metrics-history / fetchLatestMetricValue 對只有個體報表的公司都查 data_type=1', async () => {
    seen.length = 0;
    await getCompanyMetricHistory({ symbol: '5863', metricCode: 'roe', timeframe: 'TTM', limit: 10 }, deps);
    await getCompanyMetricsHistory({ symbol: '5863', metricCodes: 'roe,roa', timeframe: 'TTM', limit: 10 }, deps);
    await fetchLatestMetricValue('5863', 'roe', 'TTM', deps);
    expect(seen).toEqual(['1', '1', '1', '1']); // metrics-history 兩支各查一次
  });

  test('有合併報表的公司維持 data_type=2', async () => {
    seen.length = 0;
    await getCompanyMetricHistory({ symbol: '2330', metricCode: 'roe', timeframe: 'TTM', limit: 10 }, deps);
    expect(seen).toEqual(['2']);
  });
});
