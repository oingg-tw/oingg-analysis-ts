import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const altmanZPrimeScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'altmanZPrimeScore',
  displayName: "Altman Z′-Score 財務危機預警分數（非上市版）",
  unit: '分',
  formulaNote:
    "Z′ = 0.717*X1+0.847*X2+3.107*X3+0.42*X4+0.998*X5，X1=(流動資產-流動負債)/總資產、" +
    'X2=保留盈餘/總資產、X3=EBIT(TTM)/總資產、X4=帳面權益(歸屬母公司優先，缺漏退回整體' +
    '口徑)/總負債、X5=營收(TTM)/總資產。跟既有 altmanZScore（1968 原版，X4 用市值）是兩個' +
    '各自發表的模型（Altman 1983），不是同一指標的變體——X4 換成帳面權益、係數整套換新，' +
    '不是原版係數乘比例。獨立重新計算，不依賴 altmanZScore 已寫入的值。只有 TTM 一種' +
    ' basis，理由跟 altmanZScore 一致。',
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'current_assets',
    'current_liabilities',
    'assets',
    'retained_earnings',
    'liabilities',
    'equity_attributable_to_owners_of_parent',
    'equity',
    'profit_loss_before_tax',
    'finance_costs',
    'revenue',
  ],
  currentFormulaVersion: 1,
};
