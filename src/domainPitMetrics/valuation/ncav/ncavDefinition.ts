import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const ncavDefinition: MetricDefinitionSpec = {
  metricCode: 'ncav',
  displayName: '淨流動資產價值 (NCAV)',
  unit: '元',
  formulaNote:
    '= (本季期末流動資產 − 總負債 − 特別股股本)/流通股數。純資產負債表時點快照，只有 Q 一種' +
    'basis。marginOfSafetyPrice（= ncav x 2/3）不獨立遷移，是純線性換算，呼叫端自己乘 2/3 即可。',
  formulaLatex: '\\mathrm{NCAV} = \\frac{\\mathrm{CurrentAssets} - \\mathrm{TotalLiabilities} - \\mathrm{PreferredStock}}{\\mathrm{Shares}}',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_assets', 'liabilities', 'paidInShares'],
  currentFormulaVersion: 1,
};
