import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// 這份檔案是 src/domainMetrics/grahamNumber.ts 的獨立重新實作——舊架構呼叫
// calculateEps()+calculateBvps()，這裡不依賴 eps/bvps 這兩個 metric_code 已寫入的值，
// 自己重新查資產負債表/損益表算 EPS(TTM)/BVPS。只有 TTM 一種 basis。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { value: record.totalEquity };
  return { value: null };
};

const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface GrahamNumberPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteGrahamNumberPit = async (query: QuarterlyMetricQuery): Promise<GrahamNumberPitOutcome> => {
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
  const [balanceSheet, incomeStatement] = await Promise.all([getQuarterlyBalanceSheet(key), getQuarterlyIncomeStatement(key)]);
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const bvps = equity.value !== null && sharesValue !== null ? toPerShare(equity.value, sharesValue) : null;

  // EPS(TTM)：近四季（含本季）淨利加總。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      netIncomeTtmSum += picked.value;
    }
  }

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShare(netIncomeTtmSum, sharesValue) : null;

  // 公式假設 EPS(TTM)/BVPS 皆為正（公司要有正的獲利跟正的淨值），任一非正視為 zero_or_negative_denominator
  // （沿用既有 null_reason 詞彙，語意上最接近——不是真正的分母，是公式假設的前提條件）。
  const grahamNumber = epsTtm !== null && bvps !== null && epsTtm > 0 && bvps > 0 ? Math.round(Math.sqrt(22.5 * epsTtm * bvps) * 100) / 100 : null;
  let nullReason: MetricNullReason | null = null;
  if (grahamNumber === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (epsTtm === null || bvps === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else {
    ttm = await writeMetricValue({
      symbol,
      metricCode: 'grahamNumber',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('TTM'),
      value: grahamNumber,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, ttm };
};
