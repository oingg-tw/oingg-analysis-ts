import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
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
export const computeEarningsToRecordHigh = async (query: QuarterlyMetricQuery, deps: EarningsToRecordHighDeps): Promise<EarningsToRecordHighComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const currentNetIncome = pickNetIncome(incomeStatement).value;

  const priorQuarters = getPastNQuarters({ rocYear, season: season as Season }, LOOKBACK_QUARTERS + 1).slice(0, LOOKBACK_QUARTERS);
  const priorNetIncomes = await Promise.all(
    priorQuarters.map(async (pq) => pickNetIncome(await deps.statements.getIncomeStatement({ symbol, year: Number(pq.year), quarter: Number(pq.season), dataType, subsidiaryCompanyId })).value)
  );

  const historyComplete = priorNetIncomes.every((v) => v !== null);
  const recordHigh = historyComplete ? (priorNetIncomes as bigint[]).reduce((max, v) => (v > max ? v : max)) : null;

  const value = currentNetIncome !== null && recordHigh !== null && recordHigh > 0n ? toPercent(currentNetIncome, recordHigh) : null;
  const nullReason: MetricNullReason | null =
    value !== null ? null : currentNetIncome === null ? 'missing_input' : !historyComplete ? 'insufficient_history' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'earningsToRecordHigh', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', value, nullReason);

  return { symbol, rocYear: year, season, slots: { q } };
};
