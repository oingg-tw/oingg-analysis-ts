import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const equityMultiplierDefinition: MetricDefinitionSpec = {
  metricCode: 'equityMultiplier',
  displayName: '權益乘數',
  unit: '倍',
  formulaNote:
    '= 本季期末總資產/本季期末權益，權益優先採歸屬於母公司口徑，缺漏退回整體口徑。純資產負債表' +
    '時點快照，只有 Q 一種 basis——跟 ROE 的權益一樣沒有 TTM/年化概念。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['assets', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
