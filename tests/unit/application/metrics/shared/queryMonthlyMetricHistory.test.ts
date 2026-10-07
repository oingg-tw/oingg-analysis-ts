import { expect, test } from 'vitest';
import { getMetricHistoryByFieldRef } from '@/application/metrics/shared/queryMonthlyMetricHistory';
import type { MetricHistoryDeps } from '@/application/metrics/shared/queryMetricHistory';
import type { MonthlyHistoryRow } from '@/application/ports/metricValueQueries';
import type { FieldRef } from '@/domain/metrics/timeframe';

// 2026-10-07 月頻（sus.M）之前被當季報型查 metric_values、安靜回空。釘住：月頻 FieldRef 走月頻表、
// 兩種口徑合併、同月取最新 knowledgeDate、舊到新、limit/total/hasMore。
const row = (fiscalYear: number, fiscalMonth: number, value: number, knowledgeDate: string): MonthlyHistoryRow => ({
  fiscalYear,
  fiscalMonth,
  value,
  nullReason: null,
  knowledgeDate: new Date(`${knowledgeDate}T00:00:00Z`),
  knowledgeDateIsFallback: false,
  formulaVersion: 1,
});

const notMonthly = async () => {
  throw new Error('月頻不該查季表／逐日表');
};
const deps = (byDataType: Record<string, MonthlyHistoryRow[]>) =>
  ({
    metricValueQueries: {
      listMonthlyMetricHistoryRows: async (_s: string, _m: string, dataType: string) => byDataType[dataType] ?? [],
      listPeriodMetricHistoryRows: notMonthly,
      listDailyCadenceMetricHistoryRows: notMonthly,
    },
  }) as unknown as MetricHistoryDeps;

const sus: FieldRef = { field: 'sus.M', metricCode: 'sus', isDailyCadence: false, isMonthly: true, periodType: 'N/A', lookbackRange: 'N/A', samplingInterval: 'N/A', snapshotCadence: 'N/A' } as unknown as FieldRef;

test('月頻走 metric_monthly_values；兩種口徑合併、同月取最新 knowledgeDate、舊到新', async () => {
  const r = await getMetricHistoryByFieldRef(
    '2330',
    sus,
    '2',
    '',
    2,
    deps({ '2': [row(2026, 8, 1.5, '2026-09-10'), row(2026, 8, 1.2, '2026-09-08'), row(2026, 7, 0.9, '2026-08-10')], '1': [row(2026, 6, 0.3, '2026-07-10')] })
  );
  expect(r.entries.map((e) => [e.fiscalYear, e.fiscalMonth, e.fiscalQuarter, e.value])).toEqual([
    [2026, 7, null, 0.9],
    [2026, 8, null, 1.5],
  ]);
  expect(r).toMatchObject({ total: 3, hasMore: true });
});
