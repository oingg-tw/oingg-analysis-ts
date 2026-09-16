import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveBeneishMScoreInputs, resolveVariableNullReason, type BasisOutcome } from '../beneishMScore/computeBeneishMScorePit';
import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';

export interface BeneishAqiPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

// 2026-09-13：AQI 是 beneishMScore 8 個變量之一，曝露成獨立 metric_code——共用
// resolveBeneishMScoreInputs()，不重新查財報、不重新推導公式，見 beneishAqiDefinition.ts
// 的說明。
export const computeAndWriteBeneishAqiPit = async (query: QuarterlyMetricQuery): Promise<BeneishAqiPitOutcome> => {
  const resolution = await resolveBeneishMScoreInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, mainAnchor, aqi } = resolution;
  const value = resolution.isFinancial ? null : aqi;
  const nullReason = resolveVariableNullReason(aqi, resolution);

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      symbol,
      metricCode: 'beneishAqi',
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
