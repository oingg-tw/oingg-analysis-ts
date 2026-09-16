import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const receivablesDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'receivablesDays',
  name: 'DSO',
  unit: '天',
  formulaNote: 'DSO = 365/應收帳款周轉率（TTM）。只有 TTM 一種 basis，理由同 inventoryDays。',
  formulaLatex: '\\mathrm{DSO} = \\frac{365}{\\mathrm{ReceivablesTurnover}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%87%89%E6%94%B6%E5%B8%B3%E6%AC%BE%E9%80%B1%E8%BD%89%E5%A4%A9%E6%95%B8',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['revenue', 'accountsReceivable'],
  currentFormulaVersion: 1,
};
