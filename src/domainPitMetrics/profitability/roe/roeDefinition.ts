import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const roeDefinition: MetricDefinitionSpec = {
  metricCode: 'roe',
  displayName: '股東權益報酬率 (ROE)',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季淨利/本季期末權益*100，淨利/權益優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
    'Q_ANN = Q*4（簡易年化，非複利）；TTM = 近四季（含本季）淨利加總/本季期末權益*100，' +
    '四季不齊為 null（null_reason=insufficient_history）。這是獨立於 src/domainMetrics/roe.ts ' +
    '的重新實作（src/domainPitMetrics/profitability/roe/computeRoePit.ts），兩者理論上算出相同數字，差異即代表其中一份有 bug。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
