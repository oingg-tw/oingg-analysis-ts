import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-09 負債組成九項之一（web-nuxt 負債組成頁、使用者選逐科目拆），非流動負債底下。計算規則（缺行當 0、推算的其他、租賃抽取缺口給 null）
// 見 domain/financials/liabilityBreakdown.ts；九項相加＝debtRatio。金融業不分流動／非流動 → 不適用。
export const leaseLiabilitiesToAssetsDefinition: MetricDefinitionSpec = {
  metricCode: 'leaseLiabilitiesToAssets',
  name: '租賃負債占總資產比',
  unit: '%',
  notApplicableToFinancialIndustry: true,
  formulaNote: '= 本季期末非流動租賃負債（流動部分在其他流動負債）/本季期末總資產*100。純資產負債表時點快照，只有 Q。',
  formulaLatex: '\\mathrm{LeaseLiabilitiesToAssets} = \\frac{\\mathrm{LeaseLiabilities}}{\\mathrm{TotalAssets}} \\times 100',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['noncurrent_lease_liabilities', 'assets'],
  currentFormulaVersion: 1,
};
