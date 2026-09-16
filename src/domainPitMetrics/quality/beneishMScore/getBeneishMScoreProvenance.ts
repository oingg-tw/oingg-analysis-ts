import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveBeneishMScoreInputs, type QuarterData } from './computeBeneishMScorePit';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——beneishMScore = -4.84 + 0.92×DSRI + 0.528×GMI +
// 0.404×AQI + 0.892×SGI + 0.115×DEPI - 0.172×SGAI + 4.037×TATA + 0.0327×LVGI，8 個變量
// 各自是本期 vs 去年同季的比率之比。跟 computeBeneishMScorePit.ts 共用同一個
// resolveBeneishMScoreInputs（跟 beneishAqi/beneishDsri 共用同一份計算）。
//
// 跟既有 altmanZScore 的先例一致：金融保險業排除是「寫入路徑」的政策決定，不是公式
// 本身的一部分，這裡刻意「不」套用排除，永遠算出並顯示原始公式結果，讓使用者自己判斷
// 這個分數對金融保險業適不適用（見 getAltmanZScoreProvenance.ts 同樣的先例）。
//
// entries 列出本期+去年同季各自的 11 個原始欄位（不逐一列出 8 個變量本身——那些是比率
// 之比，屬於計算出的中繼值，用 methodologyNote 說明各變量數值）。

const buildQuarterEntries = (label: string, fiscalYear: number, fiscalQuarter: number, data: QuarterData): ProvenanceEntry[] => [
  { role: `${label}應收帳款淨額`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'accounts_receivable_net', sourceDescription: null, value: toProvenanceEntryValue(data.accountsReceivable) },
  { role: `${label}營收`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'revenue', sourceDescription: null, value: toProvenanceEntryValue(data.operatingRevenue) },
  { role: `${label}毛利`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'gross_profit', sourceDescription: null, value: toProvenanceEntryValue(data.grossProfit) },
  { role: `${label}流動資產`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(data.currentAssets) },
  { role: `${label}總資產`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(data.totalAssets) },
  { role: `${label}不動產、廠房及設備`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'property_plant_and_equipment', sourceDescription: null, value: toProvenanceEntryValue(data.propertyPlantEquipment) },
  { role: `${label}推銷費用`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'selling_expense', sourceDescription: null, value: toProvenanceEntryValue(data.sellingExpenses) },
  { role: `${label}管理費用`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'administrative_expense', sourceDescription: null, value: toProvenanceEntryValue(data.adminExpenses) },
  { role: `${label}總負債`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'liabilities', sourceDescription: null, value: toProvenanceEntryValue(data.totalLiabilities) },
  { role: `${label}折舊`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'cashFlowStatement', fieldKey: 'adj_depreciation_expense', sourceDescription: null, value: toProvenanceEntryValue(data.depreciation) },
  { role: `${label}淨利（歸屬母公司優先，缺漏退回整體口徑）`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: null, sourceDescription: null, value: toProvenanceEntryValue(data.netIncome) },
  { role: `${label}營業活動現金流`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'cashFlowStatement', fieldKey: 'cash_flows_from_used_in_operating_activities', sourceDescription: null, value: toProvenanceEntryValue(data.operatingCashFlow) },
];

export const getBeneishMScoreProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveBeneishMScoreInputs(query);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'beneishMScore', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, curr, prev, priorRocYear, priorSeason, dsri, gmi, aqi, sgi, depi, sgai, tata, lvgi, mScore } = resolution;
  const priorFiscalYear = rocYearToGregorian(priorRocYear);

  const entries: ProvenanceEntry[] = [
    ...buildQuarterEntries('本季', fiscalYear, fiscalQuarter, curr),
    ...buildQuarterEntries('去年同季', priorFiscalYear, priorSeason, prev),
  ];

  return {
    symbol,
    metricCode: 'beneishMScore',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: mScore,
    entries,
    methodologyNote: `8 個變量皆是計算出的中繼值（本期比率/去年同期比率的比值）：DSRI＝${dsri ?? 'null'}、GMI＝${gmi ?? 'null'}、AQI＝${aqi ?? 'null'}、SGI＝${sgi ?? 'null'}、DEPI＝${depi ?? 'null'}、SGAI＝${sgai ?? 'null'}、TATA＝${tata ?? 'null'}、LVGI＝${lvgi ?? 'null'}。mScore = -4.84+0.92×DSRI+0.528×GMI+0.404×AQI+0.892×SGI+0.115×DEPI-0.172×SGAI+4.037×TATA+0.0327×LVGI。此模型不適用金融保險業，但這裡刻意不套用排除，永遠顯示原始公式結果（跟 altmanZScore 稽核鏈同樣的先例），排除判斷是寫入路徑的政策，不影響這裡的計算展示。`,
  };
};
