import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const otherOperatingIncomeExpensePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'otherOperatingIncomeExpensePerShare',
  name: '每股其他營業收益及費損淨額',
  nameEn: 'Other Operating Income and Expense Per Share',
  unit: '元',
  formulaNote:
    'Q = 當季其他收益及費損淨額（net_other_income_expenses）*1000/流通股數；TTM = 近四季（含本季）' +
    '加總*1000/流通股數，四季不齊為 null。流通股數固定用「本季報告日」當下有效的股本。' +
    '這是「毛利 − 營業費用」與「營業利益」之間的差額項，可正可負；多數公司沒有這個科目' +
    '（實測覆蓋率約 5%），null 代表該公司該季沒有揭露、不是資料缺漏。2026-09-24 為了讓' +
    '「營收→股利」瀑布圖的營業利益那一段能加總還原而新增。' +
    'FY(年報) = 年報全年金額*1000/全年加權平均流通股數（歸屬母公司淨利÷年報基本每股盈餘反推；|EPS|<0.1 不提供），座標是該年度第四季。',
  formulaLatex: '\\mathrm{OtherOperatingIncomeExpensePerShare} = \\frac{\\mathrm{NetOtherIncomeExpenses}}{\\mathrm{Shares}}',
  referenceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '公開發行公司年度財務報告（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM', 'FY'],
  dependsOn: ['net_other_income_expenses', 'paidInShares'],
  currentFormulaVersion: 1,
};
