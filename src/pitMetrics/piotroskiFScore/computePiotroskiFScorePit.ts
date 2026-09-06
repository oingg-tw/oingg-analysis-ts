import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement, getQuarterlyCashFlowStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/piotroskiFScore.ts 的獨立重新實作。9 個二元訊號本季 vs
// 去年同季比較——去年同季用 getPastNQuarters({rocYear,season},5)[0]（5 季前，取最舊那一筆）
// 取得，不是專門的新機制，是既有 getPastNQuarters 的另一種用法。只有 Q 一種 basis，純粹
// 單點比較，沒有 TTM/年化概念。只遷移最終分數，9 個訊號本身不拆成獨立 metric_code。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const ratio = (numerator: bigint | null, denominator: bigint | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0n) return null;
  return Number(numerator) / Number(denominator);
};

interface QuarterData {
  totalAssets: bigint | null;
  longTermBorrowings: bigint | null;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  netIncome: bigint | null;
  grossProfit: bigint | null;
  operatingRevenue: bigint | null;
  operatingCashFlow: bigint | null;
  paidInShares: bigint | null;
  reportDate: Date | null;
  available: boolean; // 三張表是否至少都存在（不論欄位是否為 null）
}

const fetchQuarterData = async (symbol: string, rocYear: number, season: number, dataType: string, subsidiaryCompanyId: string): Promise<QuarterData> => {
  const key = { symbol, year: rocYear, quarter: season, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    getQuarterlyBalanceSheet(key),
    getQuarterlyIncomeStatement(key),
    getQuarterlyCashFlowStatement(key),
  ]);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;

  return {
    totalAssets: balanceSheet?.totalAssets ?? null,
    longTermBorrowings: balanceSheet?.longTermBorrowings ?? null,
    currentAssets: balanceSheet?.currentAssets ?? null,
    currentLiabilities: balanceSheet?.currentLiabilities ?? null,
    netIncome: pickNetIncome(incomeStatement).value,
    grossProfit: incomeStatement?.grossProfit ?? null,
    operatingRevenue: incomeStatement?.operatingRevenue ?? null,
    operatingCashFlow: cashFlowStatement?.netCashFromOperatingActivities ?? null,
    paidInShares: shares?.paidInShares ?? null,
    reportDate,
    available: balanceSheet !== null && incomeStatement !== null && cashFlowStatement !== null,
  };
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface PiotroskiFScorePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

export const computeAndWritePiotroskiFScorePit = async (query: QuarterlyMetricQuery): Promise<PiotroskiFScorePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorRocYear = Number(prior.year);
  const priorSeasonNum = Number(prior.season);

  const [curr, prev] = await Promise.all([
    fetchQuarterData(symbol, rocYear, seasonNum, dataType, subsidiaryCompanyId),
    fetchQuarterData(symbol, priorRocYear, priorSeasonNum, dataType, subsidiaryCompanyId),
  ]);

  const currRoa = ratio(curr.netIncome, curr.totalAssets);
  const prevRoa = ratio(prev.netIncome, prev.totalAssets);
  const currLeverage = ratio(curr.longTermBorrowings ?? 0n, curr.totalAssets);
  const prevLeverage = ratio(prev.longTermBorrowings ?? 0n, prev.totalAssets);
  const currLiquidity = ratio(curr.currentAssets, curr.currentLiabilities);
  const prevLiquidity = ratio(prev.currentAssets, prev.currentLiabilities);
  const currMargin = ratio(curr.grossProfit, curr.operatingRevenue);
  const prevMargin = ratio(prev.grossProfit, prev.operatingRevenue);
  const currTurnover = ratio(curr.operatingRevenue, curr.totalAssets);
  const prevTurnover = ratio(prev.operatingRevenue, prev.totalAssets);

  const signals: (boolean | null)[] = [
    currRoa !== null ? currRoa > 0 : null, // positiveRoa
    curr.operatingCashFlow !== null ? curr.operatingCashFlow > 0n : null, // positiveCfo
    currRoa !== null && prevRoa !== null ? currRoa > prevRoa : null, // roaImproved
    curr.operatingCashFlow !== null && curr.netIncome !== null ? curr.operatingCashFlow > curr.netIncome : null, // accrualQuality
    currLeverage !== null && prevLeverage !== null ? currLeverage < prevLeverage : null, // leverageDecreased
    currLiquidity !== null && prevLiquidity !== null ? currLiquidity > prevLiquidity : null, // liquidityImproved
    curr.paidInShares !== null && prev.paidInShares !== null ? curr.paidInShares <= prev.paidInShares : null, // noDilution
    currMargin !== null && prevMargin !== null ? currMargin > prevMargin : null, // grossMarginImproved
    currTurnover !== null && prevTurnover !== null ? currTurnover > prevTurnover : null, // assetTurnoverImproved
  ];

  const allEvaluated = signals.every((s) => s !== null);
  const score = allEvaluated ? signals.reduce((sum: number, s) => sum + (s ? 1 : 0), 0) : null;

  let nullReason: MetricNullReason | null = null;
  if (score === null) {
    nullReason = !prev.available ? 'insufficient_history' : 'missing_input';
  }

  const mainAnchor = await resolveKnowledgeDate(symbol, [
    { rocYear, season: seasonNum, reportDate: curr.reportDate },
    { rocYear: priorRocYear, season: priorSeasonNum, reportDate: prev.reportDate },
  ]);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'piotroskiFScore',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      basis: 'Q',
      value: score,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
