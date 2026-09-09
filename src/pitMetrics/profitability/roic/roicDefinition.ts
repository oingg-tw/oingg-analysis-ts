import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const roicDefinition: MetricDefinitionSpec = {
  metricCode: 'roic',
  displayName: '投入資本報酬率 (ROIC)',
  unit: '%',
  formulaNote:
    'EBIT = 稅前淨利+利息費用；有效稅率 = 所得稅費用/稅前淨利（稅前淨利須為正，否則 NOPAT 為 ' +
    'null）；NOPAT = EBIT*(1-有效稅率)；投入資本 = 有息負債(短期借款+應付公司債+長期借款)+權益-' +
    '現金及約當現金，權益優先採歸屬母公司口徑；Q(單季) = NOPAT/投入資本*100；Q_ANN = Q*4；' +
    'TTM = 近四季（含本季）NOPAT 加總/本季期末投入資本*100（分母固定用本季，不平均不加總，跟' +
    'ROE/ROA 用期末值同一種簡化）。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: [
    'profit_loss_before_tax',
    'finance_costs',
    'income_tax_expense_continuing_operations',
    'shortTermBorrowings',
    'bondsPayable',
    'longterm_borrowings',
    'equity_attributable_to_owners_of_parent',
    'equity',
    'cash_and_cash_equivalents',
  ],
  currentFormulaVersion: 1,
};
