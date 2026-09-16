import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const longTermDebtToNetCurrentAssetsDefinition: MetricDefinitionSpec = {
  metricCode: 'longTermDebtToNetCurrentAssets',
  name: '長期負債對淨流動資產比',
  unit: '%',
  formulaNote:
    '= 長期負債(長期借款+應付公司債非流動部分)/淨流動資產(流動資產-流動負債)*100。淨流動' +
    '資產 <=0 時不計算（zero_or_negative_denominator，分母變號會讓比率語意反過來，這種情況' +
    'currentRatio<100% 早就會標示出來）。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{LongTermDebtToNetCurrentAssets} = \\frac{\\mathrm{LongTermDebt}}{\\mathrm{CurrentAssets} - \\mathrm{CurrentLiabilities}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E5%AE%89%E5%85%A8%E9%82%8A%E9%9A%9B',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['longterm_borrowings', 'noncurrent_portion_of_bonds_issued', 'current_assets', 'current_liabilities'],
  currentFormulaVersion: 1,
};
