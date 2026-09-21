import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricNullReason } from '@/domain/metrics/metricBasis';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

export type EarningsToRecordHighDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type EarningsToRecordHighComputationBatch = ComputationBatch<'q'>;

// 前 12 季（不含本季）：getPastNQuarters(…, 13) 回傳含本季共 13 季、升冪，切掉最後一個就是本季之前的 12 季。
const LOOKBACK_QUARTERS = 12;

// 盈餘創新高比率 = 本季淨利 / 前 12 季最高單季淨利 * 100（顧廣平等 2025，近三年變體，見 Definition
// 檔頭）。12 季任一季查無損益表或淨利缺漏 → insufficient_history；最高值 ≤ 0 → zero_or_negative_denominator
// （本季淨利本身缺漏 → missing_input）。只有 Q 一種 basis。
// 2026-09-21：抽出 resolveEarningsToRecordHighInputs()——13 季淨利明細與「最高那一季」的座標，給
// getEarningsToRecordHighProvenance.ts 共用（讀者想知道創的是哪一季的新高），寫入路徑行為不變。
export interface EarningsToRecordHighQuarter {
  rocYear: number;
  season: number;
  fiscalYear: number;
  netIncome: PickedField;
}

export interface EarningsToRecordHighResolution {
  year: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  current: EarningsToRecordHighQuarter;
  priors: EarningsToRecordHighQuarter[]; // 前 12 季，舊到新
  recordHighQuarter: EarningsToRecordHighQuarter | null; // 前 12 季裡淨利最高的那一季（12 季齊全時才有）
  value: number | null;
  nullReason: MetricNullReason | null;
  reportDate: Date | null;
}

export const resolveEarningsToRecordHighInputs = async (query: QuarterlyMetricQuery, deps: EarningsToRecordHighDeps): Promise<EarningsToRecordHighResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);
  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const toQuarter = async (y: number, q: number): Promise<{ detail: EarningsToRecordHighQuarter; reportDate: Date | null }> => {
    const record = await deps.statements.getIncomeStatement({ symbol, year: y, quarter: q, dataType, subsidiaryCompanyId });
    return { detail: { rocYear: y, season: q, fiscalYear: rocYearToGregorian(y), netIncome: pickNetIncome(record) }, reportDate: record?.reportDate ?? null };
  };

  const { detail: current, reportDate } = await toQuarter(rocYear, seasonNum);
  const priorQuarters = getPastNQuarters({ rocYear, season: season as Season }, LOOKBACK_QUARTERS + 1).slice(0, LOOKBACK_QUARTERS);
  const priors = (await Promise.all(priorQuarters.map((pq) => toQuarter(Number(pq.year), Number(pq.season))))).map((r) => r.detail);

  const historyComplete = priors.every((p) => p.netIncome.value !== null);
  const recordHighQuarter = historyComplete ? priors.reduce((best, p) => (p.netIncome.value! > best.netIncome.value! ? p : best)) : null;
  const recordHigh = recordHighQuarter?.netIncome.value ?? null;
  const currentNetIncome = current.netIncome.value;

  const value = currentNetIncome !== null && recordHigh !== null && recordHigh > 0n ? toPercent(currentNetIncome, recordHigh) : null;
  const nullReason: MetricNullReason | null =
    value !== null ? null : currentNetIncome === null ? 'missing_input' : !historyComplete ? 'insufficient_history' : 'zero_or_negative_denominator';

  return { year, season, fiscalYear, fiscalQuarter: seasonNum, current, priors, recordHighQuarter, value, nullReason, reportDate };
};

export const computeEarningsToRecordHigh = async (query: QuarterlyMetricQuery, deps: EarningsToRecordHighDeps): Promise<EarningsToRecordHighComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolution = await resolveEarningsToRecordHighInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(symbol, ['q']);
  }
  const { year, season, fiscalYear, fiscalQuarter: seasonNum, value, nullReason, reportDate } = resolution;
  const rocYear = Number(year);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'earningsToRecordHigh', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', value, nullReason);

  return { symbol, rocYear: year, season, slots: { q } };
};
