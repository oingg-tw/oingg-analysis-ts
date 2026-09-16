import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const operatingIncomePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingIncomePerShare',
  name: '每股營業利益',
  nameEn: 'Operating Income Per Share',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季營業利益*1000/流通股數（股本歷史生效日<=本季報告日的最新一筆）；TTM = ' +
    '近四季（含本季）營業利益加總*1000/流通股數，四季不齊為 null。流通股數固定用「本季' +
    '報告日」當下有效的股本，Q/TTM 共用同一個股數（跟 eps 一致）。直接讀損益表營業利益' +
    '科目，不是用 operatingMargin(TTM)×revenuePerShare 反推——理由同 grossProfitPerShare。',
  formulaLatex: '\\mathrm{OperatingIncomePerShare} = \\frac{\\mathrm{OperatingIncome}}{\\mathrm{Shares}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Operating_margin',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_from_operating_activities', 'paidInShares'],
  currentFormulaVersion: 1,
};
