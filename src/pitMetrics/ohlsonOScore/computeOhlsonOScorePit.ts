import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyCashFlowStatement, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/ohlsonOScore.ts 的獨立重新實作。Logit 財務危機預警模型：
// O = -1.32 - 0.407*SIZE + 6.03*TLTA - 1.43*WCTA + 0.0757*CLCA - 1.72*OENEG - 2.37*NITA
//     - 1.83*FUTL + 0.285*INTWO - 0.521*CHIN
// NITA/FUTL/INTWO/CHIN 需要「本年 TTM」跟「去年同季 TTM」兩個窗口——去年同季錨點比照
// piotroskiFScore/beneishMScore 用 getPastNQuarters({rocYear,season},5)[0]，再用那個錨點
// 建去年的 TTM 窗口（getPastNQuarters(...,4)）。只有 TTM 一種 basis。只遷移 oScore，
// probabilityOfBankruptcy（純函式轉換）跟 9 個內部變量不獨立遷移。

const pickNetIncome = (record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  return record.netIncome;
};

const sumNetIncome = (records: ({ netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null)[]): bigint | null => {
  let sum = 0n;
  for (const record of records) {
    const value = pickNetIncome(record);
    if (value === null) return null;
    sum += value;
  }
  return sum;
};

const round4 = (x: number): number => Math.round(x * 10000) / 10000;

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface OhlsonOScorePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteOhlsonOScorePit = async (query: QuarterlyMetricQuery): Promise<OhlsonOScorePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const thisYearTtmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const priorYearAnchor = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorYearTtmQuarters = getPastNQuarters({ rocYear: Number(priorYearAnchor.year), season: priorYearAnchor.season }, 4);

  const balanceSheetKey = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const fetchIncomeStatement = (tq: { year: string; season: Season }) =>
    getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId });
  const fetchCashFlow = (tq: { year: string; season: Season }) =>
    getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId });

  const [balanceSheet, thisYearIncomeRecords, priorYearIncomeRecords, thisYearCashFlowRecords] = await Promise.all([
    getQuarterlyBalanceSheet(balanceSheetKey),
    Promise.all(thisYearTtmQuarters.map(fetchIncomeStatement)),
    Promise.all(priorYearTtmQuarters.map(fetchIncomeStatement)),
    Promise.all(thisYearTtmQuarters.map(fetchCashFlow)),
  ]);

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const netIncomeTtm = sumNetIncome(thisYearIncomeRecords);
  const netIncomeTtmPriorYear = sumNetIncome(priorYearIncomeRecords);

  let operatingCashFlowTtm: bigint | null = 0n;
  for (const record of thisYearCashFlowRecords) {
    if (!record || record.netCashFromOperatingActivities === null) {
      operatingCashFlowTtm = null;
      break;
    }
    operatingCashFlowTtm += record.netCashFromOperatingActivities;
  }

  const size = totalAssets !== null && totalAssets > 0n ? round4(Math.log(Number(totalAssets))) : null;
  const tlta = totalAssets !== null && totalLiabilities !== null && totalAssets !== 0n ? round4(Number(totalLiabilities) / Number(totalAssets)) : null;
  const wcta =
    totalAssets !== null && currentAssets !== null && currentLiabilities !== null && totalAssets !== 0n
      ? round4((Number(currentAssets) - Number(currentLiabilities)) / Number(totalAssets))
      : null;
  const clca = currentAssets !== null && currentLiabilities !== null && currentAssets !== 0n ? round4(Number(currentLiabilities) / Number(currentAssets)) : null;
  const oeneg = totalAssets !== null && totalLiabilities !== null ? (totalLiabilities > totalAssets ? 1 : 0) : null;
  const nita = netIncomeTtm !== null && totalAssets !== null && totalAssets !== 0n ? round4(Number(netIncomeTtm) / Number(totalAssets)) : null;
  const futl =
    operatingCashFlowTtm !== null && totalLiabilities !== null && totalLiabilities !== 0n ? round4(Number(operatingCashFlowTtm) / Number(totalLiabilities)) : null;
  const intwo = netIncomeTtm !== null && netIncomeTtmPriorYear !== null ? (netIncomeTtm < 0n && netIncomeTtmPriorYear < 0n ? 1 : 0) : null;
  const chin =
    netIncomeTtm !== null && netIncomeTtmPriorYear !== null && (netIncomeTtm !== 0n || netIncomeTtmPriorYear !== 0n)
      ? round4(Number(netIncomeTtm - netIncomeTtmPriorYear) / (Math.abs(Number(netIncomeTtm)) + Math.abs(Number(netIncomeTtmPriorYear))))
      : null;

  const variables = [size, tlta, wcta, clca, oeneg, nita, futl, intwo, chin];
  const oScore = variables.every((v) => v !== null)
    ? round4(-1.32 - 0.407 * size! + 6.03 * tlta! - 1.43 * wcta! + 0.0757 * clca! - 1.72 * oeneg! - 2.37 * nita! - 1.83 * futl! + 0.285 * intwo! - 0.521 * chin!)
    : null;

  const ttmComplete = netIncomeTtm !== null && netIncomeTtmPriorYear !== null && operatingCashFlowTtm !== null;

  let nullReason: MetricNullReason | null = null;
  if (oScore === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (totalAssets === null || totalLiabilities === null || currentAssets === null || currentLiabilities === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  const coordinateBase = { symbol, metricCode: 'ohlsonOScore', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(symbol, [
      ...thisYearTtmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: thisYearIncomeRecords[i]?.reportDate ?? null })),
      ...priorYearTtmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: priorYearIncomeRecords[i]?.reportDate ?? null })),
    ]);
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        basis: 'TTM',
        value: oScore,
        nullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
    if (!mainAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        basis: 'TTM',
        value: null,
        nullReason: 'insufficient_history',
        knowledgeDate: mainAnchor.knowledgeDate,
        knowledgeDateIsFallback: mainAnchor.isFallback,
      });
    }
  }

  return { symbol, rocYear: year, season, ttm };
};
