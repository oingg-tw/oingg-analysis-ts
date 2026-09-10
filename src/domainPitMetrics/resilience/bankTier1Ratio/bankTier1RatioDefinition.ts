import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankTier1RatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankTier1Ratio',
  displayName: '銀行第一類資本比率 (Tier 1)',
  unit: '%',
  formulaNote: '第一類資本比率（Tier1），直接讀已經算好的 ratio_tier_i_capital_to_rwa，跟 bankCarRatio/bankCet1Ratio 共用同一次查詢/同一組 knowledge_date，覆蓋率/頻率限制同 bankCarRatio。',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%AC%AC%E4%B8%80%E9%A1%9E%E8%B3%87%E6%9C%AC',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['ratioTierICapitalToRwa'],
  currentFormulaVersion: 1,
};
