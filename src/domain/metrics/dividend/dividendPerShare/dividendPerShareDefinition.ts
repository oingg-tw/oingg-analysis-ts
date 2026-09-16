import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const dividendPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendPerShare',
  name: '每股股利',
  nameEn: 'Dividend Per Share',
  unit: '元',
  formulaNote:
    'TTM = 近四季（含本季）現金流量表「發放現金股利」（財務活動現金流出，取絕對值）' +
    '加總*1000/流通股數，四季不齊為 null。只有 TTM 一種 basis——股利通常一年發放 1-2 ' +
    '次，單季數字大多是 0，會嚴重失真，跟 dividendPayoutRatio 同一個理由，沒有 Q 版本。' +
    '直接讀現金流量表實際發放金額，不是用 eps×dividendPayoutRatio 反推——避免兩個都是' +
    '已四捨五入過的欄位相乘，疊加出跟實際發放金額對不上的數字。',
  formulaLatex: '\\mathrm{DividendPerShare} = \\frac{|\\mathrm{DividendsPaid}|}{\\mathrm{Shares}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['dividends_paid_financing', 'paidInShares'],
  currentFormulaVersion: 1,
};
