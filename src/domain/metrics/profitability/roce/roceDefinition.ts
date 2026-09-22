import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const roceDefinition: MetricDefinitionSpec = {
  metricCode: 'roce',
  name: 'ROCE',
  unit: '%',
  formulaNote:
    'EBIT = 稅前淨利+利息費用；使用資本(Capital Employed) = 總資產-流動負債（期間平均）；' +
    'Q(單季) = EBIT/平均使用資本*100；TTM = 近四季（含本季）EBIT 加總/平均使用' +
    '資本*100。（2026-09-22 formulaVersion 2：分母改期間平均——Q 取本季與上季期末兩點、TTM 取近四季窗口 5 個季末的平均，理由見 application/metrics/shared/averageBalances.ts；v1 用本季單一期末值。）',
  formulaLatex:
    '\\mathrm{ROCE} = \\frac{\\mathrm{EBIT}}{\\mathrm{CapitalEmployed}} \\times 100,\\quad \\mathrm{CapitalEmployed} = \\mathrm{TotalAssets} - \\mathrm{CurrentLiabilities}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Return_on_capital_employed',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['assets', 'current_liabilities', 'profit_loss_before_tax', 'finance_costs'],
  currentFormulaVersion: 2,
};
