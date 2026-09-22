import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickEquityValue as pickEquity } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { averageOf, resolveAverageBalances } from '../../shared/averageBalances';

// 2026-09-22 formulaVersion 2：NOA 從本季期末改成期間平均（Q 兩點、TTM 5 個季末），見 shared/averageBalances.ts。
export const RNOA_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/nissimPenmanRnoa.ts 的獨立重新實作，只遷移 RNOA 本身
// （= NOPAT / NOA），不遷移 FLEV/NBC/SPREAD/reconstructedRoe（模型內部機制，不是獨立
// 有意義的財務比率）。因為不算 NBC，這裡「一季是否齊全」的判斷只看 NOPAT 算不算得出來，
// 比舊架構（NOPAT 跟稅後淨利息費用都要非 null）更精確——跟第二層 margins 家族同樣的
// 「不因不相關欄位缺漏連累」判斷，不是疏漏。

interface IncomeStatementSlice {
  operatingIncome: bigint | null;
  profitBeforeTax: bigint | null;
  incomeTaxExpense: bigint | null;
}

const calculateEffectiveTaxRate = (record: IncomeStatementSlice | null): number | null => {
  if (!record || record.profitBeforeTax === null || record.incomeTaxExpense === null || record.profitBeforeTax <= 0n) return null;
  return Number(record.incomeTaxExpense) / Number(record.profitBeforeTax);
};

const calculateNopat = (record: IncomeStatementSlice | null): bigint | null => {
  const effectiveTaxRate = calculateEffectiveTaxRate(record);
  if (!record || record.operatingIncome === null || effectiveTaxRate === null) return null;
  return BigInt(Math.round(Number(record.operatingIncome) * (1 - effectiveTaxRate)));
};


export type NissimPenmanRnoaDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type NissimPenmanRnoaComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeNissimPenmanRnoa = async (query: QuarterlyMetricQuery, deps: NissimPenmanRnoaDeps): Promise<NissimPenmanRnoaComputationBatch> => {
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
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const interestBearingDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const equity = pickEquity(balanceSheet);
  const nfo = interestBearingDebt !== null && cashAndEquivalents !== null ? interestBearingDebt - cashAndEquivalents : null;
  const noa = nfo !== null && equity !== null ? equity + nfo : null;

  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const pickNoa = (bs: NonNullable<typeof balanceSheet>): bigint | null => {
    const e = pickEquity(bs);
    return e !== null && bs.cashAndEquivalents !== null ? e + (bs.shortTermBorrowings ?? 0n) + (bs.bondsPayable ?? 0n) + (bs.longTermBorrowings ?? 0n) - bs.cashAndEquivalents : null;
  };
  const noaAvgQ = averageOf(balances, pickNoa, 'q');
  const noaAvgTtm = averageOf(balances, pickNoa, 'ttm');

  const nopat = calculateNopat(incomeStatement);
  const rnoaQuarterlyPct = nopat !== null && noaAvgQ !== null ? toPercent(nopat, noaAvgQ) : null;

  let qNullReason: MetricNullReason | null = null;
  if (rnoaQuarterlyPct === null) {
    qNullReason = nopat === null || noa === null ? 'missing_input' : noaAvgQ === null ? 'insufficient_history' : 'zero_or_negative_denominator';
  }

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'nissimPenmanRnoa', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', rnoaQuarterlyPct, qNullReason);

  // TTM：近四季（含本季）NOPAT 加總 / 本季期末 NOA（分母固定用期末值，跟 roic 的 TTM 邏輯一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let nopatTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = calculateNopat(record);
    if (picked === null) {
      ttmComplete = false;
    } else {
      nopatTtmSum += picked;
    }
  }

  const rnoaTtmPct = ttmComplete && noaAvgTtm !== null ? toPercent(nopatTtmSum, noaAvgTtm) : null;
  let ttmNullReason: MetricNullReason | null = null;
  if (rnoaTtmPct === null) {
    ttmNullReason = !ttmComplete ? 'insufficient_history' : noa === null ? 'missing_input' : noaAvgTtm === null ? 'insufficient_history' : 'zero_or_negative_denominator';
  }

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
        value: rnoaTtmPct,
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

  const versioned = (slot: ComputationSlot): ComputationSlot => (isComputationSkip(slot) ? slot : { ...slot, formulaVersion: RNOA_FORMULA_VERSION });
  return { symbol, rocYear: year, season, slots: { q: versioned(q), ttm: versioned(ttm) } };
};
