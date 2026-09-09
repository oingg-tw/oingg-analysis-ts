import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { calculateFcf } from '@/domainPitMetrics/quality/cashFlowPerShare/fcf';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface DividendCoverageRatioPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

// 股利保障倍數（現金流版）= TTM 自由現金流（FCF，見 quality/cashFlowPerShare/fcf.ts 的
// calculateFcf） / TTM 股利發放現金（dividendsPaid）——衡量配息是不是真的用自由現金流
// 撐得住，還是得舉債/賣資產硬發，跟 dividendPayoutRatio（用「淨利」當分母的會計盈餘角度）
// 是互補而非重複的兩支指標，故意分開不合併。沒有配發股利（TTM 股利發放現金加總為 0）時
// 這個比率沒有意義，回傳 null（zero_or_negative_denominator），不是無限大或 0。
export const computeAndWriteDividendCoverageRatioPit = async (query: QuarterlyMetricQuery): Promise<DividendCoverageRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const mainCashFlow = await getQuarterlyCashFlowStatement(key);
  const reportDate = mainCashFlow?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ocfSum = 0n;
  let capexSum = 0n;
  let dividendsSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.netCashFromOperatingActivities === null || record.capitalExpenditures === null) {
      ttmComplete = false;
    } else {
      ocfSum += record.netCashFromOperatingActivities;
      capexSum += record.capitalExpenditures;
      // 股利發放缺漏視為 0——大多數季度本來就沒發放，不是資料缺漏（比照 dividendPayoutRatio 的既有規則）。
      dividendsSum += record.dividendsPaid ?? 0n;
    }
  }

  const fcfSum = ttmComplete ? calculateFcf(ocfSum, capexSum) : null;
  const dividendsAbs = dividendsSum < 0n ? -dividendsSum : dividendsSum;
  const coverageRatio = ttmComplete && fcfSum !== null && dividendsAbs > 0n ? Math.round((Number(fcfSum) / Number(dividendsAbs)) * 100) / 100 : null;
  const nullReason: MetricNullReason | null = coverageRatio !== null ? null : !ttmComplete ? 'insufficient_history' : 'zero_or_negative_denominator';

  const coordinateBase = { symbol, metricCode: 'dividendCoverageRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: coverageRatio,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, ttm };
};
