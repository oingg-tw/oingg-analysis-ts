import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { determineNullReason, toPerShare } from '@/domainPitMetrics/shared/numericHelpers';
import { pickEquity } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type BalanceSheetPort, type PaidInSharesPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';

// 這份檔案是 src/domainMetrics/bvps.ts 的獨立重新實作。BVPS 是資產負債表時點快照，跟
// equityMultiplier 同一種形狀，只有 Q 一種 basis，沒有 TTM/年化概念。

export type BvpsPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteBvpsPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort & PaidInSharesPort = financialDataAdapter): Promise<BvpsPitOutcome> => {
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
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? null;

  const shares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const bvps = equity.value !== null && sharesValue !== null ? toPerShare(equity.value, sharesValue) : null;
  const nullReason: MetricNullReason | null = bvps === null ? determineNullReason(equity.value, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'bvps',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: bvps,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
