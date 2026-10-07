import type { FieldRef } from '@/domain/metrics/timeframe';
import { getMetricHistory, type MetricHistoryDeps, type MetricHistoryEntry, type MetricHistoryResult } from './queryMetricHistory';
import { getDailyCadenceMetricHistory } from './queryDailyCadenceMetricHistory';

// 2026-10-07 月頻版本（metric_monthly_values，sus 等）——形狀跟 queryDailyCadenceMetricHistory.ts 一致：兩種口徑都查、
// 同一個 (年, 月) 取 knowledgeDate 最大那筆、切 limit、舊到新。entry 的 fiscalQuarter 固定 null、多帶 fiscalMonth。
export const getMonthlyMetricHistory = async (
  symbol: string,
  metricCode: string,
  dataType: '1' | '2',
  subsidiaryCompanyId: string,
  limit: number,
  deps: MetricHistoryDeps
): Promise<MetricHistoryResult> => {
  const [primary, secondary] = await Promise.all([
    deps.metricValueQueries.listMonthlyMetricHistoryRows(symbol, metricCode, dataType, subsidiaryCompanyId),
    deps.metricValueQueries.listMonthlyMetricHistoryRows(symbol, metricCode, dataType === '1' ? '2' : '1', subsidiaryCompanyId),
  ]);
  const rows = secondary.length === 0 ? primary : [...primary, ...secondary].sort((a, b) => b.fiscalYear - a.fiscalYear || b.fiscalMonth - a.fiscalMonth || b.knowledgeDate.getTime() - a.knowledgeDate.getTime());

  const latestPerMonth = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.fiscalYear}-${row.fiscalMonth}`;
    if (!latestPerMonth.has(key)) latestPerMonth.set(key, row);
  }

  const all = [...latestPerMonth.values()];
  const entries: MetricHistoryEntry[] = all
    .slice(0, limit)
    .reverse()
    .map((row) => ({
      fiscalYear: row.fiscalYear,
      fiscalQuarter: null,
      fiscalMonth: row.fiscalMonth,
      value: row.value === null ? null : Number(row.value),
      nullReason: row.nullReason as MetricHistoryEntry['nullReason'],
      knowledgeDate: row.knowledgeDate.toISOString().slice(0, 10),
      knowledgeDateIsFallback: row.knowledgeDateIsFallback,
      formulaVersion: row.formulaVersion,
    }));
  return { entries, total: all.length, hasMore: all.length > entries.length };
};

// 依 FieldRef 選表的唯一入口——2026-10-07 之前 metric-history 與 fetchLatestMetricValue（徽章、完整度）各自寫
// `isDailyCadence ? 逐日 : 季報` 的三元，月頻被當季報型查 metric_values，安靜回空。兩邊改走這支。
export const getMetricHistoryByFieldRef = (symbol: string, fieldRef: FieldRef, dataType: '1' | '2', subsidiaryCompanyId: string, limit: number, deps: MetricHistoryDeps): Promise<MetricHistoryResult> => {
  if (fieldRef.isMonthly) return getMonthlyMetricHistory(symbol, fieldRef.metricCode, dataType, subsidiaryCompanyId, limit, deps);
  if (fieldRef.isDailyCadence) {
    const { lookbackRange, samplingInterval, snapshotCadence } = fieldRef;
    return getDailyCadenceMetricHistory(symbol, fieldRef.metricCode, { lookbackRange, samplingInterval, snapshotCadence }, dataType, subsidiaryCompanyId, limit, deps);
  }
  return getMetricHistory(symbol, fieldRef.metricCode, fieldRef.periodType, dataType, subsidiaryCompanyId, limit, deps);
};
