import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const sgrDefinition: MetricDefinitionSpec = {
  metricCode: 'sgr',
  displayName: '永續成長率',
  unit: '%',
  formulaNote:
    'TTM = ROE(TTM) x (1 - 配息率(TTM)/100)——獨立重新計算 ROE TTM 跟配息率 TTM 兩個子公式' +
    '（不依賴 roe/dividendPayoutRatio 這兩個 metric_code 已寫入的值），只有 TTM 一種 basis，' +
    '跟 src/domainMetrics/sgr.ts 只有 sgrTtm 一致。任一子計算因四季不齊而為 null 時回報' +
    'insufficient_history；子計算本身可算但值為 null（例如配息率分母≤0）時回報 missing_input。',
  formulaLatex: '\\mathrm{SGR} = \\mathrm{ROE} \\times \\left(1 - \\frac{\\mathrm{DividendPayoutRatio}}{100}\\right)',
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'equity_attributable_to_owners_of_parent',
    'equity',
    'dividendsPaid',
  ],
  currentFormulaVersion: 1,
};
