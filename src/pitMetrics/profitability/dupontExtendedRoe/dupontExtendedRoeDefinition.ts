import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const dupontExtendedRoeDefinition: MetricDefinitionSpec = {
  metricCode: 'dupontExtendedRoe',
  displayName: '杜邦五因子拆解 ROE',
  unit: '%',
  formulaNote:
    '五因子相乘 = dupontTaxBurden x dupontInterestBurden x dupontEbitMargin x assetTurnover x equityMultiplier（三個百分比因子跟兩個原始比率因子相乘後除以 10000 校正尺度）。' +
    '五個因子任一為 null，一律回報 null_reason=missing_input，細節記在各自的 metric_value 列上。理論上等於 dupontDecomposedRoe（已用真實資料驗證過一致）。沒有 Q_ANN。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'profit_loss_before_tax', 'finance_costs', 'revenue', 'assets', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
