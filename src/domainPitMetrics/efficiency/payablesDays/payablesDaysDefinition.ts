import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const payablesDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'payablesDays',
  displayName: '應付帳款付現天數 (DPO)',
  unit: '天',
  formulaNote: 'DPO = 365/應付帳款周轉率（年化或 TTM）。只有 Q_ANN/TTM 兩種 basis，理由同 inventoryDays。',
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['operating_costs', 'accountsPayable'],
  currentFormulaVersion: 1,
};
