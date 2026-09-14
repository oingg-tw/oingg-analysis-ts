import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——現金及約當現金
// 占總資產比，純資產負債表時點快照，單季即可，不需要歷史深度。只有 Q 一種 basis。

export type CashToAssetsRatioPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteCashToAssetsRatioPit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort = financialDataAdapter): Promise<CashToAssetsRatioPitOutcome> => {
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

  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;

  const ratio = cashAndEquivalents !== null && totalAssets !== null ? toPercent(cashAndEquivalents, totalAssets) : null;
  const nullReason: MetricNullReason | null = ratio !== null ? null : cashAndEquivalents === null || totalAssets === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'cashToAssetsRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', ratio, nullReason);

  return { symbol, rocYear: year, season, q };
};
