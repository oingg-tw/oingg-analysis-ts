import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const grossProfitPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'grossProfitPerShare',
  name: '每股毛利',
  nameEn: 'Gross Profit Per Share',
  unit: '元',
  formulaNote:
    'Q(單季) = 本季毛利*1000/流通股數（股本歷史生效日<=本季報告日的最新一筆）；TTM = ' +
    '近四季（含本季）毛利加總*1000/流通股數，四季不齊為 null。流通股數固定用「本季報告日」' +
    '當下有效的股本，Q/TTM 共用同一個股數（跟 eps 一致）。直接讀損益表毛利科目，不是用' +
    'grossMargin(TTM)×revenuePerShare 反推——避免 margin 欄位已經四捨五入過一次，' +
    '兩層捨入疊加出跟原始金額對不上的數字。' +
    'FY(年報) = 年報全年金額*1000/全年加權平均流通股數（歸屬母公司淨利÷年報基本每股盈餘反推；|EPS|<0.1 不提供），座標是該年度第四季。',
  formulaLatex: '\\mathrm{GrossProfitPerShare} = \\frac{\\mathrm{GrossProfit}}{\\mathrm{Shares}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%AF%9B%E5%88%A9_(%E6%9C%83%E8%A8%88)',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '公開發行公司年度財務報告（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['gross_profit', 'paidInShares'],
  currentFormulaVersion: 1,
};
