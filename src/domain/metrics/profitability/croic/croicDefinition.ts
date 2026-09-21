import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——CROIC（Cash
// Return on Invested Capital），InvestedCapital 沿用既有 roic 的定義（付息負債+股東權益
// -現金），分子改用自由現金流而不是稅後淨營業利益（NOPAT）。只有 TTM 一種 basis。
export const croicDefinition: MetricDefinitionSpec = {
  metricCode: 'croic',
  name: 'CROIC',
  unit: '%',
  formulaNote: '= 近四季自由現金流（OCF-資本支出）加總 ÷ 投入資本（付息負債+股東權益-現金，跟既有 roic 同一套定義）。',
  formulaLatex: '\\mathrm{CROIC} = \\dfrac{\\mathrm{FCF}_{\\mathrm{TTM}}}{\\mathrm{InvestedCapital}}',
  referenceUrl: 'https://www.investopedia.com/terms/c/cashreturnoninvestment.asp',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'shortterm_borrowings',
    'noncurrent_portion_of_bonds_issued',
    'longterm_borrowings',
    'equity_attributable_to_owners_of_parent',
    'equity',
    'cash_and_cash_equivalents',
    'cash_flows_from_used_in_operating_activities',
    'purchase_of_ppe_investing',
  ],
  currentFormulaVersion: 1,
};
