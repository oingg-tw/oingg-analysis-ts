import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const bankTier1RatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankTier1Ratio',
  displayName: '銀行第一類資本比率 (Tier 1)',
  unit: '%',
  formulaNote: '第一類資本比率（Tier1），直接讀已經算好的 ratio_tier_i_capital_to_rwa，跟 bankCarRatio/bankCet1Ratio 共用同一次查詢/同一組 knowledge_date，覆蓋率/頻率限制同 bankCarRatio。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['ratioTierICapitalToRwa'],
  currentFormulaVersion: 1,
};
