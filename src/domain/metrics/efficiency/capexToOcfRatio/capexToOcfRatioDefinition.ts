import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——衡量營業活動
// 現金流有多少比例被拿去做資本支出，只有 TTM 一種 basis。
export const capexToOcfRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'capexToOcfRatio',
  name: '資本支出占營業現金流比',
  unit: '%',
  formulaNote: '= 近四季資本支出（絕對值）加總 ÷ 近四季營業活動現金流量加總，衡量營業現金流有多少比例被拿去做資本支出。',
  formulaLatex: '\\mathrm{Capex/OCF} = \\dfrac{|\\mathrm{Capex}_{\\mathrm{TTM}}|}{\\mathrm{OCF}_{\\mathrm{TTM}}}',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['cash_flows_from_used_in_operating_activities', 'purchase_of_ppe_investing'],
  currentFormulaVersion: 1,
};
