import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import type { Prisma } from '#generated/analysis-client';
import type { SnapshotCadence } from '@/domain/metrics/metricBasis';
import type { FieldRef } from '@/domain/metrics/timeframe';
import type { CompanyRankRow, FieldDistribution, MetricValueQueryPort } from '@/application/ports/metricValueQueries';
import { buildDistributionBins, clampBucketIndex } from '@/domain/shared/distribution';
import { listDailyCadenceMetricHistoryRows, listPeriodMetricHistoryRows } from './metricValueRepository';
import {
  buildCompanyRankSql,
  buildDistributionBinsSql,
  buildDistributionBoundsSql,
  buildRankingSql,
  buildScreenerSql,
  buildValuesSql,
  type DistributionBoundsRow,
  type DistributionBucketRow,
} from './screenerQueries';

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

// application/ports/metricValueQueries.ts 的實作；兩支歷史查詢的本體在 metricValueRepository.ts（跟寫入端同一個
// 檔案，Phase 2 搬進來時就放那裡），screener 四種查詢 = ./screenerQueries.ts 組 SQL + 這裡執行——Prisma.Sql 不出
// infrastructure。
// 全市場某個欄位的分布——見 screenerQueries.ts 的 buildDistributionBoundsSql/buildDistributionBinsSql
// 開頭說明：先查邊界（p1/p99 當裁切範圍，同時拿真實 min/max），totalCount=0 或 p1=p99（樣本太少/
// 全部同值）時不用查第二支分箱查詢；width_bucket 回傳的 bucket 可能是 0 或 bins+1（範圍外），
// 用 clampBucketIndex 夾回 [1, bins] 再累加，離群值視覺上落進最左/最右一格，不會憑空消失。
const fetchDistribution = async (field: FieldRef, bins: number, excludeZero: boolean): Promise<FieldDistribution> => {
  const [bounds] = await runAnalysisRawQuery<DistributionBoundsRow>(buildDistributionBoundsSql(field, excludeZero));
  const totalCount = Number(bounds?.total_count ?? 0);
  if (totalCount === 0) {
    return { totalCount: 0, trueMin: null, trueMax: null, clippedMin: null, clippedMax: null, bins: [] };
  }

  const trueMin = Number(bounds!.true_min);
  const trueMax = Number(bounds!.true_max);
  const p1 = Number(bounds!.p1);
  const p99 = Number(bounds!.p99);

  if (p1 === p99) {
    return { totalCount, trueMin, trueMax, clippedMin: p1, clippedMax: p99, bins: [{ min: p1, max: p99, count: totalCount }] };
  }

  const bucketRows = await runAnalysisRawQuery<DistributionBucketRow>(buildDistributionBinsSql(field, p1, p99, bins, excludeZero));
  const countsByBucket = new Map<number, number>();
  for (const row of bucketRows) {
    const clamped = clampBucketIndex(Number(row.bucket), bins);
    countsByBucket.set(clamped, (countsByBucket.get(clamped) ?? 0) + Number(row.count));
  }

  return { totalCount, trueMin, trueMax, clippedMin: p1, clippedMax: p99, bins: buildDistributionBins(p1, p99, bins, countsByBucket) };
};

export const analysisMetricValueQueries: MetricValueQueryPort = {
  findLatestSnapshotValue,
  countMetricRowsWrittenSince,
  listPeriodMetricHistoryRows,
  listDailyCadenceMetricHistoryRows,
  screen: (filters, columns, page, pageSize, sort, candidateSymbols) => runAnalysisRawQuery<Record<string, unknown>>(buildScreenerSql(filters, columns, page, pageSize, sort, candidateSymbols)),
  rank: (rankedField, direction, limit, columns, candidateSymbols) => runAnalysisRawQuery<Record<string, unknown>>(buildRankingSql(rankedField, direction, limit, columns, candidateSymbols)),
  companyRank: (symbol, field, direction, excludeZero) => runAnalysisRawQuery<CompanyRankRow>(buildCompanyRankSql(symbol, field, direction, excludeZero)),
  values: (symbols, columns) => runAnalysisRawQuery<Record<string, unknown>>(buildValuesSql(symbols, columns)),
  distribution: fetchDistribution,
};
