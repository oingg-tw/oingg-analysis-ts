import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const accrualsRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'accrualsRatio',
  displayName: '應計項目比率',
  unit: '%',
  formulaNote:
    'Q(單季) = (本季淨利 − 本季營業活動現金流 − 本季投資活動現金流) / 本季期末總資產 * 100；' +
    'Q_ANN = Q*4；TTM 分子改用近四季（含本季）加總，分母仍固定用本季期末總資產（不平均、不' +
    '加總，跟 ROE/ROA 用期末值同一種簡化）。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'netCashFromOperatingActivities',
    'netCashFromInvestingActivities',
    'assets',
  ],
  currentFormulaVersion: 1,
};
