import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveBeneishMScoreInputs, resolveVariableNullReason, type BeneishMScoreDeps } from '../beneishMScore/computeBeneishMScore';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';

// 全部 I/O 都在借用的 resolveBeneishMScoreInputs 裡，deps 就是它的那一組。
export type BeneishDsriDeps = BeneishMScoreDeps;

export type BeneishDsriComputationBatch = ComputationBatch<'q'>;

// 2026-09-13：DSRI 是 beneishMScore 8 個變量之一，曝露成獨立 metric_code——共用
// resolveBeneishMScoreInputs()，不重新查財報、不重新推導公式，見 beneishDsriDefinition.ts
// 的說明。
export const computeBeneishDsri = async (query: QuarterlyMetricQuery, deps: BeneishDsriDeps): Promise<BeneishDsriComputationBatch> => {
  const resolution = await resolveBeneishMScoreInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(query.symbol, ['q']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, mainAnchor, dsri } = resolution;
  const value = resolution.isFinancial ? null : dsri;
  const nullReason = resolveVariableNullReason(dsri, resolution);

  let q: ComputationSlot;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
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

  return { symbol, rocYear, season, slots: { q } };
};
