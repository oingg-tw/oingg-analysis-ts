import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——見
// computeTurnoverRatioFamilyPit.ts 的擴充說明，只有 TTM 一種 basis。
export const inventoryToRevenueRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'inventoryToRevenueRatio',
  displayName: '存貨占營收比',
  unit: '%',
  formulaNote: '= 本季期末存貨 ÷ 近四季營收加總，衡量存貨水位相對於營收規模是否偏高。',
  formulaLatex: '\\mathrm{Inventory/Revenue} = \\dfrac{\\mathrm{Inventory}}{\\mathrm{Revenue}_{\\mathrm{TTM}}}',
  tier: 'derived',
  sources: ['資產負債表（XBRL）', '損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['inventories', 'revenue'],
  currentFormulaVersion: 1,
};
