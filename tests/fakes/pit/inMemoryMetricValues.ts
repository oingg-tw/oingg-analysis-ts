import type {
  DailyCadenceCoordinateWhere,
  ExistingMetricRow,
  MetricRowValues,
  MetricValueRepository,
  MonthlyCoordinateWhere,
  PeriodCoordinateWhere,
} from '@/application/ports/metricValues';

// metric_values / metric_daily_cadence_values 的記憶體版 repository——語意對齊 Prisma 版
// （infrastructure/repositories/analysis/metricValueRepository.ts）：findLatest* 用座標（不含
// knowledgeDate）查、依 knowledgeDate 降冪取第一筆；upsert* 的鍵是「座標 + knowledgeDate」的完整
// identity，已存在就只更新 value/nullReason/knowledgeDateIsFallback/formulaVersion（跟 Prisma 的
// update 子句一樣，不動 knowledgeDate）。rows() 給測試檢查最後落地的內容。

export interface StoredMetricRow<W = PeriodCoordinateWhere | DailyCadenceCoordinateWhere | MonthlyCoordinateWhere> {
  where: W;
  values: MetricRowValues;
}

const sameValue = (a: unknown, b: unknown): boolean => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

const matches = (row: StoredMetricRow, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([key, value]) => sameValue((row.where as unknown as Record<string, unknown>)[key], value));

export interface InMemoryMetricValues extends MetricValueRepository {
  rows(): StoredMetricRow[];
  seed(rows: StoredMetricRow[]): void;
}

export const createInMemoryMetricValues = (): InMemoryMetricValues => {
  const rows: StoredMetricRow[] = [];

  const findLatest = async (where: Record<string, unknown>): Promise<ExistingMetricRow | null> => {
    const candidates = rows.filter((row) => matches(row, where)).sort((a, b) => b.values.knowledgeDate.getTime() - a.values.knowledgeDate.getTime());
    const latest = candidates[0];
    return latest ? { value: latest.values.value, nullReason: latest.values.nullReason, knowledgeDate: latest.values.knowledgeDate, formulaVersion: latest.values.formulaVersion } : null;
  };

  const upsert = async (where: Record<string, unknown>, values: MetricRowValues): Promise<void> => {
    const existing = rows.find((row) => matches(row, where) && row.values.knowledgeDate.getTime() === values.knowledgeDate.getTime());
    if (existing) {
      existing.values = { ...existing.values, value: values.value, nullReason: values.nullReason, knowledgeDateIsFallback: values.knowledgeDateIsFallback, formulaVersion: values.formulaVersion };
      return;
    }
    rows.push({ where: where as unknown as PeriodCoordinateWhere | DailyCadenceCoordinateWhere | MonthlyCoordinateWhere, values: { ...values } });
  };

  return {
    findLatestPeriodRow: (where) => findLatest(where as unknown as Record<string, unknown>),
    upsertPeriodRow: (where, values) => upsert(where as unknown as Record<string, unknown>, values),
    findLatestDailyCadenceRow: (where) => findLatest(where as unknown as Record<string, unknown>),
    upsertDailyCadenceRow: (where, values) => upsert(where as unknown as Record<string, unknown>, values),
    findLatestMonthlyRow: (where) => findLatest(where as unknown as Record<string, unknown>),
    upsertMonthlyRow: (where, values) => upsert(where as unknown as Record<string, unknown>, values),
    rows: () => rows.map((row) => ({ where: { ...row.where }, values: { ...row.values } })),
    seed: (seedRows) => {
      for (const row of seedRows) rows.push({ where: { ...row.where }, values: { ...row.values } });
    },
  };
};
