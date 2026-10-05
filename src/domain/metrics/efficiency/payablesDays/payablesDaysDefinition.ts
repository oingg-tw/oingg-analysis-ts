import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const payablesDaysDefinition: MetricDefinitionSpec = {
  metricCode: 'payablesDays',
  name: '應付帳款付現天數',
  unit: '天',
  notApplicableToFinancialIndustry: true,
  formulaNote: 'DPO = 365/應付帳款周轉率（TTM）。單季版的換算理由同 inventoryDays。（2026-09-22 formulaVersion 2：上游週轉率的分母改成期間平均，這支跟著換版；公式本身不變。）' +
    '（2026-10-05 新增）Q(單季)：一季以 365/4 天計，用單季週轉率換算（= 365 ÷（單季週轉率×4）），跟 TTM 同一把尺；溯源表是近四季。',
  formulaLatex: '\\mathrm{DPO} = \\frac{365}{\\mathrm{PayablesTurnover}}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Days_payable_outstanding',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['operating_costs', 'accountsPayable'],
  currentFormulaVersion: 2,
};
