import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const fcfMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'fcfMargin',
  name: '自由現金流利潤率',
  nameEn: 'FCF Margin',
  unit: '%',
  formulaNote:
    '自由現金流 = 營業活動現金流 + 投資性資本支出（capitalExpenditures，現金流量表原始' +
    '科目已是負數，直接相加）；TTM = 近四季（含本季）自由現金流加總 / 近四季營業收入加總' +
    '* 100。獨立重新計算（不依賴 ocfPerShare/fcfPerShare/fcfYield 已寫入的值）。只有 TTM' +
    '一種 basis——單季現金流波動大，年化沒有意義。',
  formulaLatex: '\\mathrm{FcfMargin} = \\frac{\\mathrm{OCF} + \\mathrm{CapEx}}{\\mathrm{Revenue}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Free_cash_flow',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures', 'revenue'],
  currentFormulaVersion: 1,
};
