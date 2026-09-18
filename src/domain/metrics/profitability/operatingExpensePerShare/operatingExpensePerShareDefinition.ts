import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const operatingExpensePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingExpensePerShare',
  name: '每股營業費用',
  nameEn: 'Operating Expenses Per Share',
  unit: '元',
  formulaNote:
    'TTM = 近四季（含本季）營業費用合計加總*1000/流通股數，四季不齊為 null。流通股數固定用' +
    '「本季報告日」當下有效的股本。直接讀損益表營業費用合計科目（operating_expense，是推銷+' +
    '管理+研發費用的合計小計，真實揭露的單一科目），不是用 grossProfitPerShare − ' +
    'operatingIncomePerShare 反推——理由同 grossProfitPerShare。2026-09-18 應 web-nuxt' +
    '「營收到股利去了哪裡」瀑布圖需求新增，只做 TTM。實測全市場 115Q2：93% 的公司毛利−這個' +
    '欄位＝營業利益完全吻合，5% 對不上、2% 缺資料——少數公司損益表在這三個科目之外還有其他' +
    '落在營業利益區間內的項目，這條鏈不保證每家公司都嚴絲合縫，是資料本身的限制。',
  formulaLatex: '\\mathrm{OperatingExpensePerShare} = \\frac{\\mathrm{OperatingExpense}}{\\mathrm{Shares}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%87%9F%E4%B8%9A%E8%B4%B9%E7%94%A8',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['operating_expense', 'paidInShares'],
  currentFormulaVersion: 1,
};
