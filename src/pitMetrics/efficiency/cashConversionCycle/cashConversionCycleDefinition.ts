import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const cashConversionCycleDefinition: MetricDefinitionSpec = {
  metricCode: 'cashConversionCycle',
  displayName: '現金轉換循環 (CCC)',
  unit: '天',
  formulaNote:
    'CCC = DIO + DSO − DPO。只有 Q_ANN/TTM 兩種 basis（跟三個組成天數一致）。三個組成任一為' +
    'null，不管原因為何，一律回報 missing_input——除非是因為 TTM 四季不齊，這種情況回報' +
    'insufficient_history（跟 Dupont 家族的複合值傳染判斷一致）。',
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['operating_costs', 'inventories', 'revenue', 'accountsReceivable', 'accountsPayable'],
  currentFormulaVersion: 1,
};
