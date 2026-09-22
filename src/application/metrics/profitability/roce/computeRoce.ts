import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { averageOf, resolveAverageBalances } from '../../shared/averageBalances';

// 2026-09-22 formulaVersion 2：使用資本從本季期末改成期間平均（Q 兩點、TTM 5 個季末），見 shared/averageBalances.ts。
export const ROCE_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/roce.ts 的獨立重新實作。EBIT = 稅前淨利+利息費用，這個公式
// 在 interestCoverage/netDebtToEbitda/roic/roce 四個舊架構檔案各自重複定義，延續既有慣例。

const computeEbit = (record: { profitBeforeTax: bigint | null; financeCosts: bigint | null } | null): bigint | null => {
  if (!record || record.profitBeforeTax === null || record.financeCosts === null) return null;
  return record.profitBeforeTax + record.financeCosts;
};


export type RoceDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type RoceComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeRoce = async (query: QuarterlyMetricQuery, deps: RoceDeps): Promise<RoceComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([deps.statements.getBalanceSheet(key), deps.statements.getIncomeStatement(key)]);

  const ebit = computeEbit(incomeStatement);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const capitalEmployed = totalAssets !== null && currentLiabilities !== null ? totalAssets - currentLiabilities : null;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const pickCapitalEmployed = (bs: NonNullable<typeof balanceSheet>): bigint | null => (bs.totalAssets !== null && bs.currentLiabilities !== null ? bs.totalAssets - bs.currentLiabilities : null);
  const capitalEmployedAvgQ = averageOf(balances, pickCapitalEmployed, 'q');
  const capitalEmployedAvgTtm = averageOf(balances, pickCapitalEmployed, 'ttm');
  // 平均分母湊不齊（缺前期季末）但本季自己的存量在 → insufficient_history，不是 missing_input（2026-09-22 分母改平均）。
  const denominatorNullReason = (numerator: bigint | null, average: bigint | null, current: bigint | null): MetricNullReason =>
    numerator !== null && average === null && current !== null ? 'insufficient_history' : determineNullReason(numerator, average ?? current);

  const roceQuarterlyPct = ebit !== null && capitalEmployedAvgQ !== null ? toPercent(ebit, capitalEmployedAvgQ) : null;
  const quarterlyNullReason: MetricNullReason | null = roceQuarterlyPct === null ? denominatorNullReason(ebit, capitalEmployedAvgQ, capitalEmployed) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'roce', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', roceQuarterlyPct, quarterlyNullReason);

  // TTM：近四季（含本季）EBIT 加總，使用資本固定用本季期末值（不平均不加總）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ebitTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const quarterEbit = computeEbit(record);
    if (quarterEbit === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += quarterEbit;
    }
  }

  const ttmValue = ttmComplete && capitalEmployedAvgTtm !== null ? toPercent(ebitTtmSum, capitalEmployedAvgTtm) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? denominatorNullReason(ebitTtmSum, capitalEmployedAvgTtm, capitalEmployed) : 'insufficient_history';

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  const versioned = (slot: ComputationSlot): ComputationSlot => (isComputationSkip(slot) ? slot : { ...slot, formulaVersion: ROCE_FORMULA_VERSION });
  return { symbol, rocYear: year, season, slots: { q: versioned(q), ttm: versioned(ttm) } };
};
