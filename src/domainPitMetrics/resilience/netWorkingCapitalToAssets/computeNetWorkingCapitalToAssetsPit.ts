import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { determineNullReason, toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';
import { rocYearToGregorian } from '@/shared/rocQuarter';

// 量化選股盤點使用者要求新增。純資產負債表時點快照，只有 Q 一種 basis，跟
// debtRatio/equityRatio 同一種形狀。

export type NetWorkingCapitalToAssetsPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteNetWorkingCapitalToAssetsPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort = financialDataAdapter): Promise<NetWorkingCapitalToAssetsPitOutcome> => {
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
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const numerator = currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null;
  const value = numerator !== null && totalAssets !== null ? toPercent(numerator, totalAssets) : null;
  const nullReason: MetricNullReason | null = value === null ? determineNullReason(numerator, totalAssets) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'netWorkingCapitalToAssets',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
