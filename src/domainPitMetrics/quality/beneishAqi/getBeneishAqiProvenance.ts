import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveBeneishMScoreInputs } from '../beneishMScore/computeBeneishMScorePit';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——beneishAqi = 本期資產品質指標(=1-(流動資產+不動產
// 廠房設備)/總資產) / 去年同期同一指標。是 beneishMScore 8 個變量之一，曝露成獨立
// metric_code，共用同一個 resolveBeneishMScoreInputs（跟 computeBeneishAqiPit.ts 一致）。
// 跟 beneishMScore 稽核鏈同樣的先例：不套用金融保險業排除，永遠顯示原始公式結果。

export const getBeneishAqiProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveBeneishMScoreInputs(query);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'beneishAqi', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, curr, prev, priorRocYear, priorSeason, aqi } = resolution;
  const priorFiscalYear = rocYearToGregorian(priorRocYear);
  const value = aqi !== null ? Math.round(aqi * 10000) / 10000 : null;

  const buildEntries = (label: string, entryFiscalYear: number, entryFiscalQuarter: number, data: typeof curr): ProvenanceEntry[] => [
    { role: `${label}流動資產`, fiscalYear: entryFiscalYear, fiscalQuarter: entryFiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(data.currentAssets) },
    { role: `${label}不動產、廠房及設備`, fiscalYear: entryFiscalYear, fiscalQuarter: entryFiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'property_plant_and_equipment', sourceDescription: null, value: toProvenanceEntryValue(data.propertyPlantEquipment) },
    { role: `${label}總資產`, fiscalYear: entryFiscalYear, fiscalQuarter: entryFiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(data.totalAssets) },
  ];

  const entries: ProvenanceEntry[] = [
    ...buildEntries('本季', fiscalYear, fiscalQuarter, curr),
    ...buildEntries('去年同季', priorFiscalYear, priorSeason, prev),
  ];

  return {
    symbol,
    metricCode: 'beneishAqi',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value,
    entries,
    methodologyNote: '資產品質指標 = 1-(流動資產+不動產廠房設備)/總資產，AQI = 本季資產品質指標/去年同季資產品質指標，皆為計算出的中繼值。此模型不適用金融保險業，但這裡刻意不套用排除，永遠顯示原始公式結果。',
  };
};
