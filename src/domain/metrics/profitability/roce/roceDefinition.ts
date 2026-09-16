import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const roceDefinition: MetricDefinitionSpec = {
  metricCode: 'roce',
  name: 'ROCE',
  unit: '%',
  formulaNote:
    'EBIT = 稅前淨利+利息費用；使用資本(Capital Employed) = 本季期末總資產-本季期末流動負債；' +
    'Q(單季) = EBIT/使用資本*100；TTM = 近四季（含本季）EBIT 加總/本季期末使用' +
    '資本*100（分母固定用本季，同 roic）。',
  formulaLatex:
    '\\mathrm{ROCE} = \\frac{\\mathrm{EBIT}}{\\mathrm{CapitalEmployed}} \\times 100,\\quad \\mathrm{CapitalEmployed} = \\mathrm{TotalAssets} - \\mathrm{CurrentLiabilities}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Return_on_capital_employed',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['assets', 'current_liabilities', 'profit_loss_before_tax', 'finance_costs'],
  currentFormulaVersion: 1,
};
