import { resolveTimeframeForMetric, ScreenerValidationError } from '@/api/bff/screener/fieldResolver';
import { getMetricHistory } from './queryMetricHistory';
import { getDailyCadenceMetricHistory } from './queryDailyCadenceMetricHistory';
import type { MetricNullReason } from '../metricBasis';

// 2026-09-13 從 evaluateCompanyBadges.ts 抽出來共用——查一支 metricCode 在給定 timeframe 下的
// 最新一筆值，不管是季報型還是逐日型指標，呼叫端不用自己判斷該查哪張表。除了 badges 端點，
// evaluateCompanyMetricCompleteness.ts（指標完整度掃描）也需要同一段邏輯，這裡開始有第二個
// 消費者，抽成共用模組。

const DATA_TYPE = '2'; // 既有 metric-history 端點的既定慣例：'2' = 合併口徑，不分子公司
const SUBSIDIARY_COMPANY_ID = '';

export interface LatestMetricValue {
  value: number | null;
  nullReason: MetricNullReason | null;
}

// timeframe 不合法（例如已排除的 metricCode，或呼叫端傳了這支 metricCode 不支援的 timeframe）回傳
// null，不 throw——呼叫端（一次掃很多 metricCode 的情境）不應該因為單一 metricCode 的 timeframe
// 問題整批失敗。
export const fetchLatestMetricValue = async (symbol: string, metricCode: string, timeframe: string): Promise<LatestMetricValue | null> => {
  let fieldRef;
  try {
    fieldRef = resolveTimeframeForMetric(metricCode, timeframe, `${metricCode}.${timeframe}`);
  } catch (error) {
    if (error instanceof ScreenerValidationError) return null;
    throw error;
  }

  const result = fieldRef.isDailyCadence
    ? await getDailyCadenceMetricHistory(symbol, metricCode, { lookbackRange: fieldRef.lookbackRange, samplingInterval: fieldRef.samplingInterval, snapshotCadence: fieldRef.snapshotCadence }, DATA_TYPE, SUBSIDIARY_COMPANY_ID, 1)
    : await getMetricHistory(symbol, metricCode, fieldRef.periodType, DATA_TYPE, SUBSIDIARY_COMPANY_ID, 1);

  const latest = result.entries.at(-1);
  if (!latest) return { value: null, nullReason: null };
  return { value: latest.value, nullReason: latest.nullReason };
};
