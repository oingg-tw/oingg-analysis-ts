import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const novyMarxGpToAssetsDefinition: MetricDefinitionSpec = {
  metricCode: 'novyMarxGpToAssets',
  name: '毛利資產比',
  nameEn: 'Novy-Marx Gross Profitability (GP/A)',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季毛利 / 本季期末總資產 * 100；TTM = 近四季（含本季）毛利' +
    '加總 / 本季期末總資產 * 100（分母固定用本季單一期末總資產，不平均、不加總，跟' +
    'ROE/ROA 用期末值同一種簡化）。',
  formulaLatex: '\\mathrm{GPToAssets} = \\frac{\\mathrm{GrossProfit}}{\\mathrm{Assets}} \\times 100',
  academicSourceUrl: 'https://doi.org/10.1016/j.jfineco.2013.04.002',
  referenceUrl: 'https://en.wikipedia.org/wiki/Robert_Novy-Marx',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['gross_profit', 'assets'],
  currentFormulaVersion: 1,
};
