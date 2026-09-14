import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { calculateFixedAssetTurnover } from './calculateFixedAssetTurnover';
import { resolveTurnoverRatioProvenanceInputs } from '../turnoverRatio/resolveTurnoverRatioProvenanceInputs';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——fixedAssetTurnover = 營收(TTM) / 本季期末不動產廠房
// 及設備，見 resolveTurnoverRatioProvenanceInputs.ts 的共用查詢說明。固定回傳 TTM。

export const getFixedAssetTurnoverProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveTurnoverRatioProvenanceInputs(query);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'fixedAssetTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, propertyPlantEquipment, ttmQuarters, ttmOperatingRevenues, ttmComplete, revenueTtmSum } = resolution;
  const result = ttmComplete ? calculateFixedAssetTurnover(revenueTtmSum, propertyPlantEquipment) : { value: null, nullReason: 'insufficient_history' as const };

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `TTM 營收（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmOperatingRevenues[i]),
      })
    ),
    {
      role: '本季期末不動產廠房及設備',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'property_plant_and_equipment',
      sourceDescription: null,
      value: toProvenanceEntryValue(propertyPlantEquipment),
    },
  ];

  return { symbol, metricCode: 'fixedAssetTurnover', found: true, fiscalYear, fiscalQuarter, value: result.value, entries, methodologyNote: null };
};
