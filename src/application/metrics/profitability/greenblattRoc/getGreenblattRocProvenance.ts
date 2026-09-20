import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveGreenblattRocInputs, type GreenblattRocDeps } from './computeGreenblattRoc';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——greenblattRoc(TTM) = 近四季 EBIT(=稅前淨利+財務費用)
// 加總 / 本季期末使用資本（淨營運資金+淨固定資產，單一期末值）。跟
// computeGreenblattRocPit.ts 共用同一個 resolveGreenblattRocInputs（跟 accrualsRatio
// 的做法一致），現查現算不持久化。固定回傳 TTM。

export const getGreenblattRocProvenance = async (query: QuarterlyMetricQuery, deps: GreenblattRocDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveGreenblattRocInputs(query, deps);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'greenblattRoc', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, currentAssets, currentLiabilities, propertyPlantEquipment, ttmQuarterDetails, rocTtm } = resolution;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    { role: '本季期末流動負債', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_liabilities', sourceDescription: null, value: toProvenanceEntryValue(currentLiabilities) },
    { role: '本季期末不動產、廠房及設備', fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'property_plant_and_equipment', sourceDescription: null, value: toProvenanceEntryValue(propertyPlantEquipment) },
    ...ttmQuarterDetails.flatMap((detail, i): ProvenanceEntry[] => [
      {
        role: `近四季 稅前淨利（第 ${i + 1}/4 季，用於 EBIT）`,
        fiscalYear: detail.fiscalYear,
        fiscalQuarter: detail.season,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'profit_loss_before_tax',
        sourceDescription: null,
        value: toProvenanceEntryValue(detail.profitBeforeTax),
      },
      {
        role: `近四季 財務費用（第 ${i + 1}/4 季，用於 EBIT）`,
        fiscalYear: detail.fiscalYear,
        fiscalQuarter: detail.season,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'finance_costs',
        sourceDescription: null,
        value: toProvenanceEntryValue(detail.financeCosts),
      },
    ]),
  ];

  return {
    symbol,
    metricCode: 'greenblattRoc',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: rocTtm,
    entries,
    methodologyNote:
      '使用資本 = 淨營運資金(流動資產-流動負債)+淨固定資產（本季期末快照，不平均不加總）。EBIT 不是財報原始欄位，是稅前淨利+財務費用相加得出的中繼值，見上方原始欄位。',
  };
};
