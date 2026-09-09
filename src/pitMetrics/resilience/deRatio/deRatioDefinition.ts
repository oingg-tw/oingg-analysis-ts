import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const deRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'deRatio',
  displayName: '負債權益比',
  unit: '倍',
  formulaNote:
    '= 有息負債(短期借款+應付公司債+長期借款)/本季期末權益*100，權益優先採歸屬母公司口徑，' +
    '缺漏退回整體口徑。純資產負債表時點快照，只有 Q 一種 basis。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['shortTermBorrowings', 'bondsPayable', 'longterm_borrowings', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
