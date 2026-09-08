import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { LookbackRange, SamplingInterval, SnapshotCadence } from './metricBasis';
import type { MetricHistoryEntry, MetricHistoryResult } from './queryMetricHistory';

export interface DailyCadenceCoordinateGroup {
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  snapshotCadence: SnapshotCadence;
}

// 2026-09-09 新增：queryMetricHistory.ts 的逐日型版本——查 metric_daily_cadence_values
// （Beta/exchangePeRatio/exchangePbRatio/dividendYield 這批指標拆表後的新家）。刻意不是
// 在 queryMetricHistory.ts 裡加分支，而是獨立一支檔案：去重鍵、排序邏輯根本不同
// （tradeDate/knowledgeDate，不是 fiscalYear/fiscalQuarter），硬塞進同一支函式只會讓
// 兩種語意糾纏在一起——這正是這次拆表要解決的問題本身。
//
// 回應形狀刻意跟 getMetricHistory 一致（fiscalYear 從 tradeDate 算出、fiscalQuarter
// 固定 null、額外多帶 tradeDate），對外部消費端（GET /companies/metric-history）零
// 破壞——metricHistoryEntrySchema 本來就允許 fiscalQuarter 為 null、tradeDate 是選填
// 欄位，見 queryMetricHistory.ts 的說明。
export const getDailyCadenceMetricHistory = async (
  symbol: string,
  metricCode: string,
  coordinate: DailyCadenceCoordinateGroup,
  dataType: '1' | '2',
  subsidiaryCompanyId: string,
  limit: number
): Promise<MetricHistoryResult> => {
  const rows = await analysisPrisma.metricDailyCadenceValue.findMany({
    where: { symbol, metricCode, ...coordinate, dataType, subsidiaryCompanyId },
    orderBy: [{ tradeDate: 'desc' }, { knowledgeDate: 'desc' }],
  });

  // 依 tradeDate 去重取最大 knowledgeDate 那筆——理論上同一個 tradeDate 只會有一筆
  // （每個交易日只重算一次），這裡跟季報型的 dedup 邏輯一致，防禦同一天重編疊加的情境。
  const latestPerTradeDate = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = row.tradeDate.toISOString().slice(0, 10);
    if (!latestPerTradeDate.has(key)) latestPerTradeDate.set(key, row);
  }

  const allDates = [...latestPerTradeDate.values()];
  const total = allDates.length;

  const entries: MetricHistoryEntry[] = allDates
    .slice(0, limit)
    .reverse() // 轉成由舊到新，方便前端直接畫時序圖
    .map((row) => ({
      fiscalYear: row.tradeDate.getUTCFullYear(),
      fiscalQuarter: null,
      tradeDate: row.tradeDate.toISOString().slice(0, 10),
      value: row.value === null ? null : Number(row.value),
      nullReason: row.nullReason as MetricHistoryEntry['nullReason'],
      knowledgeDate: row.knowledgeDate.toISOString().slice(0, 10),
      knowledgeDateIsFallback: row.knowledgeDateIsFallback,
    }));

  return { entries, total, hasMore: total > entries.length };
};
