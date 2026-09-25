import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const greenblattEarningsYieldDefinition: MetricDefinitionSpec = {
  metricCode: 'greenblattEarningsYield',
  name: '盈餘收益率',
  nameSuffix: 'Greenblatt',
  unit: '%',
  formulaNote:
    '= EBIT(TTM) / 企業價值(EV) * 100。EBIT(TTM) = 近四季（含本季）稅前淨利+利息費用加總；' +
    'EV = 市值 + 有息負債(短期借款+應付公司債+長期借款，本季期末) - 現金及約當現金(本季期末)。' +
    '跟一般本益比倒數版的 earningsYield（EPS/股價）刻意分開兩個獨立指標——Greenblatt 用 EV' +
    '取代市值，把負債/現金也算進「買下這家公司實際要付出的代價」，跟只看股權市值的' +
    'earningsYield 概念不同，不是同一指標的變體。只有 TTM 一種 basis。（2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股，已發行 − 特別股 − 庫藏股。）',
  formulaLatex: '\\mathrm{GreenblattEarningsYield} = \\frac{\\mathrm{EBIT}_{\\mathrm{TTM}}}{\\mathrm{EV}} \\times 100',
  referenceUrl: 'https://www.investing.com/academy/analysis/what-is-magic-formula-investing/',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_before_tax', 'finance_costs', 'shortTermBorrowings', 'bondsPayable', 'longTermBorrowings', 'cashAndEquivalents', 'outstandingCommonShares', 'daily_price.close'],
  currentFormulaVersion: 2,
};
