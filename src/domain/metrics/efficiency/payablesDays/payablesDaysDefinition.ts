import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const payablesDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'payablesDays',
  name: '應付帳款付現天數',
  unit: '天',
  formulaNote: 'DPO = 365/應付帳款周轉率（TTM）。只有 TTM 一種 basis，理由同 inventoryDays。（2026-09-22 formulaVersion 2：上游週轉率的分母改成期間平均，這支跟著換版；公式本身不變。）',
  formulaLatex: '\\mathrm{DPO} = \\frac{365}{\\mathrm{PayablesTurnover}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Days_payable_outstanding',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['operating_costs', 'accountsPayable'],
  currentFormulaVersion: 2,
};
