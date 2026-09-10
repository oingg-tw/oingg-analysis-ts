import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const receivablesDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'receivablesDays',
  displayName: '應收帳款收現天數 (DSO)',
  unit: '天',
  formulaNote: 'DSO = 365/應收帳款周轉率（年化或 TTM）。只有 Q_ANN/TTM 兩種 basis，理由同 inventoryDays。',
  formulaLatex: '\\mathrm{DSO} = \\frac{365}{\\mathrm{ReceivablesTurnover}}',
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['revenue', 'accountsReceivable'],
  currentFormulaVersion: 1,
};
