import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——營業活動現金流
// 占營收的比例，跟既有 grossMargin/operatingMargin/netProfitMargin 同一組利潤率家族，
// 但分子改用現金流量表口徑而不是損益表口徑，屬於「獲利品質」而非「獲利能力」，故放在
// quality 分類跟 ocfToNetIncome 同一組。只有 TTM 一種 basis。
export const ocfMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'ocfMargin',
  name: 'OCF 利潤率',
  unit: '%',
  formulaNote: '= 近四季營業活動現金流量加總 ÷ 近四季營收加總，衡量每一元營收能轉換成多少營業現金流入，跟損益表口徑的獲利率互為對照。',
  formulaLatex: '\\mathrm{OCF\\ Margin} = \\dfrac{\\mathrm{OCF}_{\\mathrm{TTM}}}{\\mathrm{Revenue}_{\\mathrm{TTM}}}',
  tier: 'derived',
  sources: ['損益表（XBRL）', '現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['revenue', 'cash_flows_from_used_in_operating_activities'],
  currentFormulaVersion: 1,
};
