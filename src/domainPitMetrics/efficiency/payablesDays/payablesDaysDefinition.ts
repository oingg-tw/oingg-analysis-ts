import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const payablesDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'payablesDays',
  name: '應付帳款付現天數',
  unit: '天',
  formulaNote: 'DPO = 365/應付帳款周轉率（年化或 TTM）。只有 Q_ANN/TTM 兩種 basis，理由同 inventoryDays。',
  formulaLatex: '\\mathrm{DPO} = \\frac{365}{\\mathrm{PayablesTurnover}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Days_payable_outstanding',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q_ANN', 'TTM'],
  dependsOn: ['operating_costs', 'accountsPayable'],
  currentFormulaVersion: 1,
};
