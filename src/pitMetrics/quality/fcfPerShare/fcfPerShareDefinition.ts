import type { MetricDefinitionSpec } from '@/pitMetrics/metricDefinitionSpec';

export const fcfPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'fcfPerShare',
  displayName: '每股自由現金流',
  unit: '元',
  formulaNote:
    'FCF = 營業活動現金流 + 資本支出（資本支出在來源資料是負值/流出，用加法，不是減法）；' +
    'Q(單季) = 本季 FCF*1000/流通股數；Q_ANN = Q*4；TTM = 近四季（含本季）FCF 加總*1000/流通' +
    '股數，四季不齊為 null。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures', 'paidInShares'],
  currentFormulaVersion: 1,
};
