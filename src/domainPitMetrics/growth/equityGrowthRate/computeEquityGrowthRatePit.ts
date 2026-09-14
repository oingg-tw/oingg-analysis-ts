import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { calculateYoyGrowthRateBigint } from '@/domainPitMetrics/shared/numericHelpers';
import { pickEquity } from '@/domainPitMetrics/shared/pickers';
import { financialDataAdapter, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';

export type EquityGrowthRatePitOutcome = StandardBasisPitOutcome;

// 淨值成長率（單季年增率）= (本季期末淨值 - 去年同季期末淨值) / |去年同季期末淨值| * 100。
// 淨值優先採歸屬母公司口徑，缺漏退回整體口徑（比照既有 pickEquity 規則，見 computeRoePit.ts）。
// 只有 Q 一種 basis——資產負債表時點快照，沒有 TTM 概念（跟 bvps/stockPrice 同一種性質）。
export const computeAndWriteEquityGrowthRatePit = async (query: QuarterlyMetricQuery, statements: BalanceSheetPort = financialDataAdapter): Promise<EquityGrowthRatePitOutcome> => {
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
  const currentEquity = pickEquity(balanceSheet).value;

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorBalanceSheet = await statements.getBalanceSheet({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorEquity = pickEquity(priorBalanceSheet).value;

  const { value: growthRate, nullReason } = calculateYoyGrowthRateBigint(currentEquity, priorEquity);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'equityGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', growthRate, nullReason);

  return { symbol, rocYear: year, season, q };
};
