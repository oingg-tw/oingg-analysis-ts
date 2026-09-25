import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const nonOperatingIncomePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'nonOperatingIncomePerShare',
  name: '每股業外損益',
  nameEn: 'Non-Operating Income Per Share',
  unit: '元',
  formulaNote:
    '業外損益 = 稅前淨利 − 營業利益（兩者都是千元原始金額，相減後才除以股數，只捨入一次）。' +
    'Q = 當季業外損益*1000/流通股數；TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。' +
    '流通股數固定用「本季報告日」當下有效的股本。2026-09-24 為了讓「營收→股利」瀑布圖每一段都能' +
    '加總還原而新增。' +
    'FY(年報) = 年報全年金額*1000/全年加權平均流通股數（歸屬母公司淨利÷年報基本每股盈餘反推；|EPS|<0.1 不提供），座標是該年度第四季。',
  formulaLatex: '\\mathrm{NonOperatingIncomePerShare} = \\frac{\\mathrm{NonOperatingIncome}}{\\mathrm{Shares}}',
  referenceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '公開發行公司年度財務報告（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['profit_loss_before_tax', 'profit_loss_from_operating_activities', 'paidInShares'],
  currentFormulaVersion: 1,
};
