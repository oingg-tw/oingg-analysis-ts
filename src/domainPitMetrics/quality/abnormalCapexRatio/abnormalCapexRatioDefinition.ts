import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const abnormalCapexRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'abnormalCapexRatio',
  displayName: '異常資本投資比率',
  unit: '%',
  formulaNote:
    'CI = 本年資本支出 / 前三年資本支出平均 - 1，Titman, Wei & Xie (2004) 提出的過度投資代理' +
    '變數——資本支出相對過去三年平均異常暴增，論文發現會預測較低的未來異常股票報酬（過度投資' +
    '假說）。本年/前三年各自取「最近一個資料完整的完整會計年度」及往前推算的年度，年度資本' +
    '支出 = 4 季 capitalExpenditures（現金流出，取絕對值後加總，跟 capexToRevenue 同一種' +
    '慣例）加總，任一季缺漏視為該年度不完整。前三年任一年不完整 → insufficient_history，不用' +
    '更少年數頂替。前三年平均為 0 → zero_or_negative_denominator。原論文是橫斷面排序（CI 越高' +
    '的投資組合相對報酬越低），不是單一公司的絕對安全門檻，故不附 badge。只有 FY 一種 basis。',
  formulaLatex: '\\mathrm{CI} = \\frac{\\mathrm{Capex}_t}{\\frac{1}{3}\\left(\\mathrm{Capex}_{t-1}+\\mathrm{Capex}_{t-2}+\\mathrm{Capex}_{t-3}\\right)} - 1',
  academicSourceUrl: 'https://doi.org/10.1017/S0022109000003173',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['capitalExpenditures'],
  currentFormulaVersion: 1,
};
