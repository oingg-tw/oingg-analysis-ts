import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import type { LookbackRange, PeriodType, SamplingInterval, SnapshotCadence } from '@/domain/metrics/metricBasis';
import type {
  DailyCadenceCoordinateWhere,
  ExistingMetricRow,
  MetricRowValues,
  MetricValueRepository,
  MonthlyCoordinateWhere,
  PeriodCoordinateWhere,
} from '@/application/ports/metricValues';
import type { DailyCadenceHistoryRow, PeriodHistoryRow } from '@/application/ports/metricValueQueries';

// metric_values（季報型）/ metric_daily_cadence_values（逐日型）兩張表的讀寫——2026-09-17 重構
// Phase 2 從 application/metrics/{metricValueWriter,shared/queryMetricHistory,
// shared/queryDailyCadenceMetricHistory}.ts 搬來的 Prisma 呼叫，逐字保留語意（identity 唯一鍵、
// orderBy、upsert 的原子性），「比對既有列決定要不要寫」的決策留在 application
// （persistComputations.ts）。回傳型別刻意用結構型別描述需要的欄位，不外洩 Prisma 的 model
// 型別；value 是 Decimal 物件，轉換維持在呼叫端。Phase 3 起這四個型別住在
// application/ports/metricValues.ts（port 的 DTO），這裡 re-export。
export type { DailyCadenceCoordinateWhere, ExistingMetricRow, MetricRowValues, MonthlyCoordinateWhere, PeriodCoordinateWhere };

// 用「座標」（不含 knowledgeDate）查最新一列（orderBy knowledgeDate desc）——「目前市場最後所知」的那一列。
export const findLatestPeriodMetricRow = (where: PeriodCoordinateWhere): Promise<ExistingMetricRow | null> =>
  analysisPrisma.metricValue.findFirst({ where, orderBy: { knowledgeDate: 'desc' }, select: { value: true, nullReason: true, knowledgeDate: true, formulaVersion: true } });

// 一次原子的 upsert（鍵是完整的 identity 唯一鍵，含 knowledgeDate）——2026-09-11 全市場 backfill
// 平行化後同一個 knowledgeDate 被重算兩次撞過唯一鍵，改讓 Postgres 自己原子地決定 insert 還是
// update，多 instance/多併發都不會再噴例外。
export const upsertPeriodMetricRow = async (where: PeriodCoordinateWhere, values: MetricRowValues): Promise<void> => {
  await analysisPrisma.metricValue.upsert({
    where: {
      symbol_metricCode_periodType_fiscalYear_fiscalQuarter_dataType_subsidiaryCompanyId_knowledgeDate: { ...where, knowledgeDate: values.knowledgeDate },
    },
    create: { ...where, ...values },
    update: { value: values.value, nullReason: values.nullReason, knowledgeDateIsFallback: values.knowledgeDateIsFallback, formulaVersion: values.formulaVersion },
  });
};

// 2026-09-23 月頻（metric_monthly_values，目前只有 sus）——跟上面兩組同一套：座標查最新、identity 鍵原子 upsert。
export const findLatestMonthlyMetricRow = (where: MonthlyCoordinateWhere): Promise<ExistingMetricRow | null> =>
  analysisPrisma.metricMonthlyValue.findFirst({ where, orderBy: { knowledgeDate: 'desc' }, select: { value: true, nullReason: true, knowledgeDate: true, formulaVersion: true } });

export const upsertMonthlyMetricRow = async (where: MonthlyCoordinateWhere, values: MetricRowValues): Promise<void> => {
  await analysisPrisma.metricMonthlyValue.upsert({
    where: { symbol_metricCode_fiscalYear_fiscalMonth_dataType_subsidiaryCompanyId_knowledgeDate: { ...where, knowledgeDate: values.knowledgeDate } },
    create: { ...where, ...values },
    update: { value: values.value, nullReason: values.nullReason, knowledgeDateIsFallback: values.knowledgeDateIsFallback, formulaVersion: values.formulaVersion },
  });
};

export const findLatestDailyCadenceMetricRow = (where: DailyCadenceCoordinateWhere): Promise<ExistingMetricRow | null> =>
  analysisPrisma.metricDailyCadenceValue.findFirst({ where, orderBy: { knowledgeDate: 'desc' }, select: { value: true, nullReason: true, knowledgeDate: true, formulaVersion: true } });

export const upsertDailyCadenceMetricRow = async (where: DailyCadenceCoordinateWhere, values: MetricRowValues): Promise<void> => {
  await analysisPrisma.metricDailyCadenceValue.upsert({
    where: {
      symbol_metricCode_lookbackRange_samplingInterval_snapshotCadence_dataType_subsidiaryCompanyId_tradeDate_knowledgeDate: { ...where, knowledgeDate: values.knowledgeDate },
    },
    create: { ...where, ...values },
    update: { value: values.value, nullReason: values.nullReason, knowledgeDateIsFallback: values.knowledgeDateIsFallback, formulaVersion: values.formulaVersion },
  });
};

// application/ports/metricValues.ts 的 MetricValueRepository 實作——src/bootstrap/pitDeps.ts 綁進 PitDeps。
export const prismaMetricValueRepository: MetricValueRepository = {
  findLatestPeriodRow: findLatestPeriodMetricRow,
  upsertPeriodRow: upsertPeriodMetricRow,
  findLatestDailyCadenceRow: findLatestDailyCadenceMetricRow,
  upsertDailyCadenceRow: upsertDailyCadenceMetricRow,
  findLatestMonthlyRow: findLatestMonthlyMetricRow,
  upsertMonthlyRow: upsertMonthlyMetricRow,
};

// ---- 歷史時序（GET /companies/metric-history 等）——列型別 Phase 4 搬到 application/ports/metricValueQueries.ts
// （讀取端 port 的 DTO），這裡 re-export；port 物件在 ./metricValueQueries.ts 組。
export type { DailyCadenceHistoryRow, PeriodHistoryRow };

// 全部列，依 (fiscalYear, fiscalQuarter, knowledgeDate) 降冪——去重取每期最大 knowledgeDate 那筆在呼叫端做。
export const listPeriodMetricHistoryRows = (
  symbol: string,
  metricCode: string,
  periodType: PeriodType,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<PeriodHistoryRow[]> =>
  analysisPrisma.metricValue.findMany({
    where: { symbol, metricCode, periodType, dataType, subsidiaryCompanyId },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }, { knowledgeDate: 'desc' }],
    select: { fiscalYear: true, fiscalQuarter: true, value: true, nullReason: true, knowledgeDate: true, knowledgeDateIsFallback: true },
  });

export const listDailyCadenceMetricHistoryRows = (
  symbol: string,
  metricCode: string,
  coordinate: { lookbackRange: LookbackRange; samplingInterval: SamplingInterval; snapshotCadence: SnapshotCadence },
  dataType: string,
  subsidiaryCompanyId: string
): Promise<DailyCadenceHistoryRow[]> =>
  analysisPrisma.metricDailyCadenceValue.findMany({
    where: { symbol, metricCode, ...coordinate, dataType, subsidiaryCompanyId },
    orderBy: [{ tradeDate: 'desc' }, { knowledgeDate: 'desc' }],
    select: { tradeDate: true, value: true, nullReason: true, knowledgeDate: true, knowledgeDateIsFallback: true },
  });
