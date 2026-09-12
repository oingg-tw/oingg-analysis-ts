import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const totalDebtToCapitalDefinition: MetricDefinitionSpec = {
  metricCode: 'totalDebtToCapital',
  name: '總負債資本比',
  nameEn: 'Total Debt to Capital',
  unit: '%',
  formulaNote:
    '有息負債 = 短期借款+應付公司債+長期借款；= 有息負債 / (有息負債 + 權益) * 100，' +
    '權益歸屬母公司優先，缺漏退回整體口徑（跟 roe/altmanZDoublePrimeScore 同一個' +
    'pickEquity 慣例）。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{TotalDebtToCapital} = \\frac{\\mathrm{Debt}}{\\mathrm{Debt} + \\mathrm{Equity}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Debt-to-capital_ratio',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['shortTermBorrowings', 'bondsPayable', 'longterm_borrowings', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
