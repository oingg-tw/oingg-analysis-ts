import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const minorityInterestPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'minorityInterestPerShare',
  name: '每股少數股東損益',
  nameEn: 'Minority Interest Per Share',
  unit: '元',
  formulaNote:
    '少數股東損益 = 稅後淨利 − 歸屬母公司業主淨利（兩者都是千元原始金額，相減後才除以股數）。' +
    'Q = 當季少數股東損益*1000/流通股數；TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。' +
    '流通股數固定用「本季報告日」當下有效的股本。2026-09-24 為了讓「營收→股利」瀑布圖每一段都能' +
    '加總還原而新增。' +
    'FY(年報) = 年報全年金額*1000/全年加權平均流通股數（歸屬母公司淨利÷年報基本每股盈餘反推；|EPS|<0.1 不提供），座標是該年度第四季。',
  formulaLatex: '\\mathrm{MinorityInterestPerShare} = \\frac{\\mathrm{MinorityInterest}}{\\mathrm{Shares}}',
  referenceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '公開發行公司年度財務報告（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['profit_loss', 'profit_loss_attributable_to_owners_of_parent', 'paidInShares'],
  currentFormulaVersion: 1,
};
