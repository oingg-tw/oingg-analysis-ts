import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——單季即可，見
// computeCashToAssetsRatioPit.ts 檔頭說明。只有 Q 一種 basis。
export const cashToAssetsRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'cashToAssetsRatio',
  name: '現金及約當現金占總資產比',
  unit: '%',
  formulaNote: '= 現金及約當現金 ÷ 資產總額，衡量資產配置中流動性最高的部位占比。',
  formulaLatex: '\\mathrm{CashToAssets} = \\dfrac{\\mathrm{Cash}}{\\mathrm{TotalAssets}} \\times 100',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['cash_and_cash_equivalents', 'assets'],
  currentFormulaVersion: 1,
};
