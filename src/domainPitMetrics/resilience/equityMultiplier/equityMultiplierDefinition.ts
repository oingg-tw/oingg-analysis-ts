import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const equityMultiplierDefinition: MetricDefinitionSpec = {
  metricCode: 'equityMultiplier',
  displayName: '權益乘數',
  unit: '倍',
  formulaNote:
    '= 本季期末總資產/本季期末權益，權益優先採歸屬於母公司口徑，缺漏退回整體口徑。純資產負債表' +
    '時點快照，只有 Q 一種 basis——跟 ROE 的權益一樣沒有 TTM/年化概念。',
  formulaLatex: '\\mathrm{EquityMultiplier} = \\frac{\\mathrm{TotalAssets}}{\\mathrm{Equity}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%AC%8A%E7%9B%8A%E4%B9%98%E6%95%B8',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['assets', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
