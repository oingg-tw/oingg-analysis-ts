import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const costOfGoodsSoldPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'costOfGoodsSoldPerShare',
  name: '每股營業成本',
  nameEn: 'Cost of Goods Sold Per Share',
  unit: '元',
  formulaNote:
    'TTM = 近四季（含本季）營業成本加總*1000/流通股數，四季不齊為 null。流通股數固定用' +
    '「本季報告日」當下有效的股本。直接讀損益表營業成本科目（operating_costs），不是用' +
    'revenuePerShare − grossProfitPerShare 反推——理由同 grossProfitPerShare：避免疊加兩個' +
    '已經各自捨入過的欄位的誤差。2026-09-18 應 web-nuxt「營收到股利去了哪裡」瀑布圖需求' +
    '新增，只做 TTM——這張卡片整張鎖 TTM，不需要單季。' +
    '2026-09-24 補上 Q（單季）：原本只做 TTM 是因為當初那張瀑布圖卡片整張鎖 TTM，不是資料限制——上游 quarterly_income_statement_xbrl 本來就是單季表。使用者要求單季也要能看整條「營收→股利」的拆解，所以補齊。' +
    'FY(年報) = 年報全年金額*1000/全年加權平均流通股數（歸屬母公司淨利÷年報基本每股盈餘反推；|EPS|<0.1 不提供），座標是該年度第四季。',
  formulaLatex: '\\mathrm{COGSPerShare} = \\frac{\\mathrm{CostOfGoodsSold}}{\\mathrm{Shares}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E9%94%80%E5%94%AE%E6%88%90%E6%9C%AC',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '公開發行公司年度財務報告（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['operating_costs', 'paidInShares'],
  currentFormulaVersion: 1,
};
