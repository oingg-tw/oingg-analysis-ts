import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import type { Prisma } from '#generated/analysis-client';
import type { SnapshotCadence } from '@/domain/metrics/metricBasis';
import type { MetricValueQueryPort } from '@/application/ports/metricValueQueries';
import { listDailyCadenceMetricHistoryRows, listPeriodMetricHistoryRows } from './metricValueRepository';

// 執行 ./screenerQueries.ts 組出來的 Prisma.Sql（screener 的四種查詢共用）。
export const runAnalysisRawQuery = <T>(sql: Prisma.Sql): Promise<T[]> => analysisPrisma.$queryRaw<T[]>(sql);

// analysis DB 的 metric_values / metric_daily_cadence_values 零星查詢——2026-09-17 重構 Phase 2
// 從 http 層（stocks/service.ts、batch/completenessCheck.ts）搬來的 Prisma 呼叫，逐字保留語意。
// 完整的歷史查詢/寫入（queryMetricHistory、metricValueWriter）在 Phase 2 後段一起收進這個資料夾。

// 某支逐日型 snapshot 指標（exchangePeRatio/exchangePbRatio/dividendYield…）目前市場最後所知的
// 一筆值——用 knowledgeDate desc 取最新，不是相信呼叫端保證同步。
export const findLatestSnapshotValue = async (
  symbol: string,
  metricCode: string,
  snapshotCadence: SnapshotCadence,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<{ tradeDate: Date; value: number | null } | null> => {
  const row = await analysisPrisma.metricDailyCadenceValue.findFirst({
    where: { symbol, metricCode, snapshotCadence, dataType, subsidiaryCompanyId },
    orderBy: { knowledgeDate: 'desc' },
  });
  if (!row) return null;
  return { tradeDate: row.tradeDate, value: row.value !== null ? Number(row.value) : null };
};

// 批次完整性檢查用：這批公司在時間窗內實際被寫入/更新的列數（computedAt >= since）。
// 季報型查 metric_values、逐日型查 metric_daily_cadence_values。
export const countMetricRowsWrittenSince = (metricCode: string, symbols: string[], since: Date, isDailyCadence: boolean): Promise<number> =>
  isDailyCadence
    ? analysisPrisma.metricDailyCadenceValue.count({ where: { metricCode, symbol: { in: symbols }, computedAt: { gte: since } } })
    : analysisPrisma.metricValue.count({ where: { metricCode, symbol: { in: symbols }, computedAt: { gte: since } } });

// application/ports/metricValueQueries.ts 的實作（screener 的查詢之後併進來）；兩支歷史查詢的本體在
// metricValueRepository.ts（跟寫入端同一個檔案，Phase 2 搬進來時就放那裡）。
export const analysisMetricValueQueries: MetricValueQueryPort = {
  findLatestSnapshotValue,
  countMetricRowsWrittenSince,
  listPeriodMetricHistoryRows,
  listDailyCadenceMetricHistoryRows,
};
