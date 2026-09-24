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
    '「營收到股利去了哪裡」瀑布圖需求新增，只做 TTM。**「毛利−這個欄位＝營業利益」不是完整' +
    '恆等式**：全市場 115Q2 實測 93%（1913/2057）完全吻合、2%（41家）缺 gross_profit（銀行/' +
    '金控/證券期貨結構性沒有毛利概念、少數生技股尚無產品營收，皆為合理缺漏，已跟 mops-ts 核對' +
    '過剩下 4 家非金融公司的缺漏是否為解析遺漏），其餘 5%（103家）差額幾乎精確等於損益表' +
    '另一個科目 net_other_income_expenses（其他利益及損失淨額）——真正的恆等式是「毛利−' +
    '營業費用+其他利益及損失淨額＝營業利益」，只是這個科目沒有獨立曝露成 per-share 指標，這裡' +
    '不吸收它，維持 operatingExpensePerShare 單純對應官方揭露的營業費用合計科目本身。' +
    '2026-09-24 補上 Q（單季）：原本只做 TTM 是因為當初那張瀑布圖卡片整張鎖 TTM，不是資料限制——上游 quarterly_income_statement_xbrl 本來就是單季表。使用者要求單季也要能看整條「營收→股利」的拆解，所以補齊。',
  formulaLatex: '\\mathrm{OperatingExpensePerShare} = \\frac{\\mathrm{OperatingExpense}}{\\mathrm{Shares}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%87%9F%E4%B8%9A%E8%B4%B9%E7%94%A8',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['operating_expense', 'paidInShares'],
  currentFormulaVersion: 1,
};
