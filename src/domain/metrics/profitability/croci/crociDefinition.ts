import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const crociDefinition: MetricDefinitionSpec = {
  metricCode: 'croci',
  name: '經濟現金回報率',
  nameEn: 'Cash Return on Capital Invested (CROCI)',
  unit: '%',
  formulaNote:
    '2026-09-13 使用簡化版公式：CROCI 原始方法論（Deutsche Bank）會對固定資產做通膨' +
    '重置成本調整、將營運租賃/研發資本化列回資產負債表等一連串專有校正，沒有公開的單一' +
    '標準公式，這裡不做那些調整。Gross Cash Flow = 稅後淨利+折舊+攤銷+財務成本（近四季' +
    '含本季加總）；Economic Capital = 總資產－流動負債的期間平均（簡化版，接近 ROIC 的' +
    '投入資本定義，不做通膨/資本化調整）。TTM = Gross Cash Flow / Economic Capital * 100。（2026-09-22 formulaVersion 2：分母改近四季窗口 5 個季末的平均，理由見 application/metrics/shared/averageBalances.ts；v1 用本季單一期末值。）',
  formulaLatex: '\\mathrm{CROCI} = \\frac{\\mathrm{NetIncome} + \\mathrm{DepreciationAmortization} + \\mathrm{Interest}}{\\overline{\\mathrm{Assets} - \\mathrm{CurrentLiabilities}}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Return_on_capital',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'depreciation', 'amortization', 'finance_costs', 'assets', 'current_liabilities'],
  currentFormulaVersion: 2,
};
