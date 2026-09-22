import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——衡量現有付息
// 負債要用多少年的自由現金流償還，只有 TTM 一種 basis。
export const debtToFcfDefinition: MetricDefinitionSpec = {
  metricCode: 'debtToFcf',
  name: '負債對自由現金流比',
  unit: '倍',
  formulaNote: '= 付息負債（短期借款+應付公司債+長期借款） ÷ 近四季自由現金流（OCF-資本支出）加總，衡量現有付息負債要用多少年的自由現金流償還。自由現金流 ≤ 0 時不計算（zero_or_negative_denominator，2026-09-22 起；負的「償還年數」無意義）。',
  formulaLatex: '\\mathrm{Debt/FCF} = \\dfrac{\\mathrm{Debt}}{\\mathrm{FCF}_{\\mathrm{TTM}}}',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['shortterm_borrowings', 'noncurrent_portion_of_bonds_issued', 'longterm_borrowings', 'cash_flows_from_used_in_operating_activities', 'purchase_of_ppe_investing'],
  currentFormulaVersion: 1,
};
