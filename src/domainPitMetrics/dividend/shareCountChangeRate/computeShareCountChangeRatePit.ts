import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { financialDataAdapter, type BalanceSheetPort, type PaidInSharesPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

export type ShareCountChangeRatePitOutcome = StandardBasisPitOutcome;

// 股本變化率（YoY）= (本季流通股數 - 去年同季流通股數) / 去年同季流通股數 * 100。正值代表
// 股數增加（現金增資/可轉債轉換等稀釋股東權益），負值代表股數減少（庫藏股註銷減資）。去年
// 同季用 getPastNQuarters({rocYear,season},5)[0] 取得（5 季前，取最舊那一筆），跟
// piotroskiFScore 的既有慣例一致，不是專門的新機制。只有 Q 一種 basis——流通股數是資產
// 負債表時點快照，沒有 TTM/年化概念（跟 bvps/stockPrice 同一種性質）。
export const computeAndWriteShareCountChangeRatePit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort & PaidInSharesPort = financialDataAdapter): Promise<ShareCountChangeRatePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
  const reportDate = balanceSheet?.reportDate ?? null;
  const currentShares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorBalanceSheet = await statements.getBalanceSheet({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorReportDate = priorBalanceSheet?.reportDate ?? null;
  const priorShares = priorReportDate ? await statements.getPaidInShares(symbol, priorReportDate) : null;

  const currentValue = currentShares?.paidInShares ?? null;
  const priorValue = priorShares?.paidInShares ?? null;

  const changeRate =
    currentValue !== null && priorValue !== null && priorValue !== 0n
      ? Math.round((Number(currentValue - priorValue) / Number(priorValue)) * 100 * 100) / 100
      : null;
  const nullReason: MetricNullReason | null = changeRate !== null ? null : currentValue === null || priorValue === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'shareCountChangeRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', changeRate, nullReason);

  return { symbol, rocYear: year, season, q };
};
