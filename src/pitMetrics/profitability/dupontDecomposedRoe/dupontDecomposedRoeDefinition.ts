import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const dupontDecomposedRoeDefinition: MetricDefinitionSpec = {
  metricCode: 'dupontDecomposedRoe',
  displayName: '杜邦三因子拆解 ROE',
  unit: '%',
  formulaNote:
    'Q(單季) = netProfitMargin(Q) x assetTurnover(Q) x equityMultiplier；' +
    'TTM = netProfitMargin(TTM) x assetTurnover(TTM) x equityMultiplier（沿用同一個 Q 的權益乘數，' +
    '跟 src/domainMetrics/dupont.ts 的 decomposedRoeTtmPct 邏輯一致）。三個因子任一為 null，' +
    '不管原因為何，一律回報 null_reason=missing_input——各因子自己缺漏的細節記在各自的 metric_value 列上。' +
    '沒有 Q_ANN——舊架構本來就沒有這個變體。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'revenue', 'assets', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
