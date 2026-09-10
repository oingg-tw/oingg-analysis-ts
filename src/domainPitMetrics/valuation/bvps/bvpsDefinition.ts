import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bvpsDefinition: MetricDefinitionSpec = {
  metricCode: 'bvps',
  displayName: '每股淨值 (BVPS)',
  unit: '元',
  formulaNote:
    '= 本季期末權益*1000/流通股數，權益優先採歸屬母公司口徑，缺漏退回整體口徑。純資產負債表' +
    '時點快照，只有 Q 一種 basis——跟 equityMultiplier 同一種形狀，沒有 TTM/年化概念。',
  formulaLatex: '\\mathrm{BVPS} = \\frac{\\mathrm{Equity}}{\\mathrm{Shares}}',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['equity_attributable_to_owners_of_parent', 'equity', 'paidInShares'],
  currentFormulaVersion: 1,
};
