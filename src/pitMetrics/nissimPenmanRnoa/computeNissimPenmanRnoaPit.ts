import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/nissimPenmanRnoa.ts 的獨立重新實作，只遷移 RNOA 本身
// （= NOPAT / NOA），不遷移 FLEV/NBC/SPREAD/reconstructedRoe（模型內部機制，不是獨立
// 有意義的財務比率）。因為不算 NBC，這裡「一季是否齊全」的判斷只看 NOPAT 算不算得出來，
// 比舊架構（NOPAT 跟稅後淨利息費用都要非 null）更精確——跟第二層 margins 家族同樣的
// 「不因不相關欄位缺漏連累」判斷，不是疏漏。

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): bigint | null => {
  if (!record) return null;
  if (record.equityAttributableToParent !== null) return record.equityAttributableToParent;
  return record.totalEquity;
};

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

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface NissimPenmanRnoaPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
  qAnn: BasisOutcome;
  ttm: BasisOutcome;
}

export const computeAndWriteNissimPenmanRnoaPit = async (query: QuarterlyMetricQuery): Promise<NissimPenmanRnoaPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, qAnn: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([getQuarterlyBalanceSheet(key), getQuarterlyIncomeStatement(key)]);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const interestBearingDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const equity = pickEquity(balanceSheet);
  const nfo = interestBearingDebt !== null && cashAndEquivalents !== null ? interestBearingDebt - cashAndEquivalents : null;
  const noa = nfo !== null && equity !== null ? equity + nfo : null;

  const nopat = calculateNopat(incomeStatement);
  const rnoaQuarterlyPct = nopat !== null && noa !== null ? toPct(nopat, noa) : null;
  const rnoaQuarterlyAnnualizedPct = rnoaQuarterlyPct !== null ? round2(rnoaQuarterlyPct * 4) : null;

  let qNullReason: MetricNullReason | null = null;
  if (rnoaQuarterlyPct === null) {
    qNullReason = nopat === null || noa === null ? 'missing_input' : 'zero_or_negative_denominator';
  }

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'nissimPenmanRnoa', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  let qAnn: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
    qAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q',
      value: rnoaQuarterlyPct,
      nullReason: qNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    qAnn = await writeMetricValue({
      ...coordinateBase,
      basis: 'Q_ANN',
      value: rnoaQuarterlyAnnualizedPct,
      nullReason: qNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  // TTM：近四季（含本季）NOPAT 加總 / 本季期末 NOA（分母固定用期末值，跟 roic 的 TTM 邏輯一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const rnoaTtmPct = ttmComplete && noa !== null ? toPct(nopatTtmSum, noa) : null;
  let ttmNullReason: MetricNullReason | null = null;
  if (rnoaTtmPct === null) {
    ttmNullReason = !ttmComplete ? 'insufficient_history' : noa === null ? 'missing_input' : 'zero_or_negative_denominator';
  }

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        basis: 'TTM',
        value: rnoaTtmPct,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, q, qAnn, ttm };
};
