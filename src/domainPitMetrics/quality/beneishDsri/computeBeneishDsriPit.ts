import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveBeneishMScoreInputs, resolveVariableNullReason, type BasisOutcome } from '../beneishMScore/computeBeneishMScorePit';
import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';

export interface BeneishDsriPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

// 2026-09-13：DSRI 是 beneishMScore 8 個變量之一，曝露成獨立 metric_code——共用
// resolveBeneishMScoreInputs()，不重新查財報、不重新推導公式，見 beneishDsriDefinition.ts
// 的說明。
export const computeAndWriteBeneishDsriPit = async (query: QuarterlyMetricQuery): Promise<BeneishDsriPitOutcome> => {
  const resolution = await resolveBeneishMScoreInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, mainAnchor, dsri } = resolution;
  const value = resolution.isFinancial ? null : dsri;
  const nullReason = resolveVariableNullReason(dsri, resolution);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'beneishDsri',
      fiscalYear,
      fiscalQuarter,
      dataType: query.dataType,
      subsidiaryCompanyId: query.subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: value !== null ? Math.round(value * 10000) / 10000 : null,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear, season, q };
};
