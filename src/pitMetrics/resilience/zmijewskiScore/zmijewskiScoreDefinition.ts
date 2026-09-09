import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const zmijewskiScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'zmijewskiScore',
  displayName: 'Zmijewski Score 財務危機預警分數',
  unit: '分',
  formulaNote:
    'X = -4.3-4.5*(淨利TTM/總資產)+5.7*(總負債/總資產)-0.004*(流動資產/流動負債)。淨利用' +
    'TTM（原始模型用年度財報校準，TTM 是最接近的替代口徑，跟 ROE/ROA 邏輯一致），其餘皆為' +
    '本季資產負債表快照。沒有 YoY，只有 TTM 一種 basis。',
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'assets',
    'liabilities',
    'current_assets',
    'current_liabilities',
  ],
  currentFormulaVersion: 1,
};
