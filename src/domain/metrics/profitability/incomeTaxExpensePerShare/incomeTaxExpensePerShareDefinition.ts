import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const incomeTaxExpensePerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'incomeTaxExpensePerShare',
  name: '每股所得稅費用',
  nameEn: 'Income Tax Expense Per Share',
  unit: '元',
  formulaNote:
    'TTM = 近四季（含本季）所得稅費用加總*1000/流通股數，四季不齊為 null。流通股數固定用' +
    '「本季報告日」當下有效的股本。直接讀損益表所得稅費用科目（income_tax_expense_' +
    'continuing_operations，當期揭露數字，不含遞延所得稅調整重建），刻意不用' +
    'pretaxIncomePerShare − eps 反推——兩者不等價：eps 的淨利是歸屬母公司口徑，而' +
    '稅前淨利−所得稅費用等於整體淨利（含少數股東權益），2026-09-18 全市場實測 115Q2 有' +
    '1109/2057（54%）家公司當季有非零少數股東權益，用減法會把少數股東權益的份額也算進' +
    '「所得稅費用」，系統性偏高。應 web-nuxt「營收到股利去了哪裡」瀑布圖需求新增，只做 TTM。' +
    '2026-09-24 補上 Q（單季）：原本只做 TTM 是因為當初那張瀑布圖卡片整張鎖 TTM，不是資料限制——上游 quarterly_income_statement_xbrl 本來就是單季表。使用者要求單季也要能看整條「營收→股利」的拆解，所以補齊。',
  formulaLatex: '\\mathrm{IncomeTaxExpensePerShare} = \\frac{\\mathrm{IncomeTaxExpense}}{\\mathrm{Shares}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%89%80%E5%BE%97%E7%A8%85%E8%B2%BB%E7%94%A8',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['income_tax_expense_continuing_operations', 'paidInShares'],
  currentFormulaVersion: 1,
};
