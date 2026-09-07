import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案是 src/domainMetrics/zmijewskiScore.ts 的獨立重新實作。Probit 財務危機預警模型：
// X = -4.3 - 4.5*(NI_TTM/總資產) + 5.7*(總負債/總資產) - 0.004*(流動資產/流動負債)。
// 淨利用 TTM（原始模型用年度財報校準），其餘資產負債表科目是本季期末快照，沒有 YoY，
// 只有 TTM 一種 basis。只遷移 xScore，probabilityOfDistress（= Φ(xScore)，純函式轉換）
// 不獨立遷移。

const pickNetIncome = (record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  return record.netIncome;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface ZmijewskiScorePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteZmijewskiScorePit = async (query: QuarterlyMetricQuery): Promise<ZmijewskiScorePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await getQuarterlyBalanceSheet(key);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  // NI(TTM)：近四季（含本季）淨利加總。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked;
    }
  }
  const netIncomeTtmValue = ttmComplete ? netIncomeTtmSum : null;

  let xScore: number | null = null;
  if (netIncomeTtmValue !== null && totalAssets !== null && totalLiabilities !== null && currentAssets !== null && currentLiabilities !== null) {
    if (totalAssets !== 0n && currentLiabilities !== 0n) {
      const roa = Number(netIncomeTtmValue) / Number(totalAssets);
      const leverage = Number(totalLiabilities) / Number(totalAssets);
      const currentRatio = Number(currentAssets) / Number(currentLiabilities);
      xScore = Math.round((-4.3 - 4.5 * roa + 5.7 * leverage - 0.004 * currentRatio) * 10000) / 10000;
    }
  }

  let nullReason: MetricNullReason | null = null;
  if (xScore === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (totalAssets === null || totalLiabilities === null || currentAssets === null || currentLiabilities === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
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
        symbol,
        metricCode: 'zmijewskiScore',
        fiscalYear,
        fiscalQuarter: seasonNum,
        dataType,
        subsidiaryCompanyId,
        basis: 'TTM',
        value: xScore,
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
        symbol,
        metricCode: 'zmijewskiScore',
        fiscalYear,
        fiscalQuarter: seasonNum,
        dataType,
        subsidiaryCompanyId,
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
