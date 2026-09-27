import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const bvpsDefinition: MetricDefinitionSpec = {
  metricCode: 'bvps',
  name: '每股淨值',
  unit: '元',
  perShare: true,
  formulaNote:
    '= (本季期末權益 − 特別股股本)*1000/流通股數（普通股每股淨值），權益優先採歸屬母公司口徑，缺漏退回整體口徑。' +
    '流通股數 = 已發行 − 特別股 − 庫藏股（IAS 33，2026-09-26 formulaVersion 2）。純資產負債表' +
    '時點快照，只有 Q 一種 basis——跟 equityMultiplier 同一種形狀，沒有 TTM/年化概念。',
  formulaLatex: '\\mathrm{BVPS} = \\frac{\\mathrm{Equity} - \\mathrm{PreferredCapital}}{\\mathrm{OutstandingCommonShares}}',
  referenceUrl: 'https://corporatefinanceinstitute.com/resources/knowledge/valuation/book-value-per-share-bvps/',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['equity_attributable_to_owners_of_parent', 'equity', 'outstandingCommonShares'],
  currentFormulaVersion: 3,
};
