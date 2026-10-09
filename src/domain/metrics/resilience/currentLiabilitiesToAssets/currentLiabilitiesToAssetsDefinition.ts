import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-09 新增（web-nuxt 需求、使用者決定）：負債比率拆成「流動負債 ÷ 總資產」＋「非流動負債 ÷ 總資產」畫堆疊長條，
// 兩支相加＝debtRatio（同一個期末總資產分母）。實測 108Q3～115Q2 非金融業「流動＋非流動≠負債總計」0 筆。
// 被否決的替代：有息負債拆法（交易所 OpenAPI 只有流動／非流動合計科目，使用者：「OpenAPI 欄位有給就沒問題」）。
// 金融業的資產負債表不分流動／非流動 → 不適用。
export const currentLiabilitiesToAssetsDefinition: MetricDefinitionSpec = {
  metricCode: 'currentLiabilitiesToAssets',
  name: '流動負債占總資產比',
  unit: '%',
  notApplicableToFinancialIndustry: true,
  formulaNote: '= 本季期末流動負債/本季期末總資產*100。純資產負債表時點快照，只有 Q；跟 nonCurrentLiabilitiesToAssets 相加等於 debtRatio。',
  formulaLatex: '\\mathrm{CurrentLiabilitiesToAssets} = \\frac{\\mathrm{CurrentLiabilities}}{\\mathrm{TotalAssets}} \\times 100',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_liabilities', 'assets'],
  currentFormulaVersion: 1,
};
