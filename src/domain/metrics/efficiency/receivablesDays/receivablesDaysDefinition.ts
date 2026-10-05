import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const receivablesDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'receivablesDays',
  // 2026-09-25 web-nuxt：原本 name 是 'DSO'，是整個分類唯一用英文縮寫當名稱的，會直接出現在側邊欄與頁面 h1。
  // 改成中文，縮寫放進 metricNarratives 的 description。
  name: '應收帳款收現天數',
  unit: '天',
  notApplicableToFinancialIndustry: true,
  formulaNote: 'DSO = 365/應收帳款周轉率（TTM）。單季版的換算理由同 inventoryDays。（2026-09-22 formulaVersion 2：上游週轉率的分母改成期間平均，這支跟著換版；公式本身不變。）' +
    '（2026-10-05 新增）Q(單季)：一季以 365/4 天計，用單季週轉率換算（= 365 ÷（單季週轉率×4）），跟 TTM 同一把尺；溯源表是近四季。',
  formulaLatex: '\\mathrm{DSO} = \\frac{365}{\\mathrm{ReceivablesTurnover}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%87%89%E6%94%B6%E5%B8%B3%E6%AC%BE%E9%80%B1%E8%BD%89%E5%A4%A9%E6%95%B8',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['revenue', 'accountsReceivable'],
  currentFormulaVersion: 2,
};
