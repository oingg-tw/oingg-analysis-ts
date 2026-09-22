import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { averageOf, resolveAverageBalances } from '../../shared/averageBalances';

// 2026-09-22 formulaVersion 2：投入資本從本季期末改成期間平均（Q 兩點、TTM 5 個季末），見 shared/averageBalances.ts。
export const ROIC_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/roic.ts 的獨立重新實作。EBIT = 稅前淨利+利息費用，這個公式
// 在 interestCoverage/netDebtToEbitda/roic/roce 四個舊架構檔案各自重複定義，延續既有慣例。

// 稅前淨利須為正，否則有效稅率沒有意義，NOPAT 視為 null（跟 roic.ts 現有行為一致）。
const computeNopat = (record: { profitBeforeTax: bigint | null; financeCosts: bigint | null; incomeTaxExpense: bigint | null } | null): bigint | null => {
  if (!record || record.profitBeforeTax === null || record.financeCosts === null || record.incomeTaxExpense === null) return null;
  if (record.profitBeforeTax <= 0n) return null;
  const ebit = record.profitBeforeTax + record.financeCosts;
  const effectiveTaxRate = Number(record.incomeTaxExpense) / Number(record.profitBeforeTax);
  return BigInt(Math.round(Number(ebit) * (1 - effectiveTaxRate)));
};


export type RoicDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type RoicComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeRoic = async (query: QuarterlyMetricQuery, deps: RoicDeps): Promise<RoicComputationBatch> => {
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

  const nopat = computeNopat(incomeStatement);
  const equity = pickEquity(balanceSheet);
  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const investedCapital =
    totalDebt !== null && equity.value !== null && cashAndEquivalents !== null ? totalDebt + equity.value - cashAndEquivalents : null;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const pickInvestedCapital = (bs: NonNullable<typeof balanceSheet>): bigint | null => {
    const e = pickEquity(bs).value;
    return e !== null && bs.cashAndEquivalents !== null ? (bs.shortTermBorrowings ?? 0n) + (bs.bondsPayable ?? 0n) + (bs.longTermBorrowings ?? 0n) + e - bs.cashAndEquivalents : null;
  };
  const investedCapitalAvgQ = averageOf(balances, pickInvestedCapital, 'q');
  const investedCapitalAvgTtm = averageOf(balances, pickInvestedCapital, 'ttm');
  // 平均分母湊不齊（缺前期季末）但本季自己的存量在 → insufficient_history，不是 missing_input（2026-09-22 分母改平均）。
  const denominatorNullReason = (numerator: bigint | null, average: bigint | null, current: bigint | null): MetricNullReason =>
    numerator !== null && average === null && current !== null ? 'insufficient_history' : determineNullReason(numerator, average ?? current);

  const roicQuarterlyPct = nopat !== null && investedCapitalAvgQ !== null ? toPercent(nopat, investedCapitalAvgQ) : null;
  const quarterlyNullReason: MetricNullReason | null = roicQuarterlyPct === null ? denominatorNullReason(nopat, investedCapitalAvgQ, investedCapital) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'roic', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', roicQuarterlyPct, quarterlyNullReason);

  // TTM：近四季（含本季）NOPAT 加總，投入資本用近四季窗口 5 個季末的平均（2026-09-22 起）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let nopatTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const quarterNopat = computeNopat(record);
    if (quarterNopat === null) {
      ttmComplete = false;
    } else {
      nopatTtmSum += quarterNopat;
    }
  }

  const ttmValue = ttmComplete && investedCapitalAvgTtm !== null ? toPercent(nopatTtmSum, investedCapitalAvgTtm) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? denominatorNullReason(nopatTtmSum, investedCapitalAvgTtm, investedCapital) : 'insufficient_history';

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

  const versioned = (slot: ComputationSlot): ComputationSlot => (isComputationSkip(slot) ? slot : { ...slot, formulaVersion: ROIC_FORMULA_VERSION });
  return { symbol, rocYear: year, season, slots: { q: versioned(q), ttm: versioned(ttm) } };
};
