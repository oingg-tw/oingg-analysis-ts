import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const bankCarRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankCarRatio',
  displayName: '銀行資本適足率 (CAR)',
  unit: '%',
  formulaNote:
    '資本適足率 = eligible_capital / risk_weighted_assets * 100——這批唯一自己做除法的' +
    '欄位（其餘都是直接讀 mops-ts 算好的比率）。資料源 bank_capital_adequacy_detail_xbrl' +
    '只覆蓋 6-7 檔銀行/金控股，且只有 Q2/Q4 有真實值（監理揭露頻率本來就是半年一次，' +
    'Q1/Q3 一律 missing_input，不是資料缺漏）。不給 year/season 時的「最新一季」判斷刻意' +
    '排除值為 null 的季度，見 getLatestQuarterWithBankCapitalAdequacy 的說明。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['eligibleCapital', 'riskWeightedAssets'],
  currentFormulaVersion: 1,
};
