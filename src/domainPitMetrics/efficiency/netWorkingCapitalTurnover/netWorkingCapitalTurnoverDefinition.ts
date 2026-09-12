import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——見
// computeTurnoverRatioFamilyPit.ts 的擴充說明，只有 TTM 一種 basis。
export const netWorkingCapitalTurnoverDefinition: MetricDefinitionSpec = {
  metricCode: 'netWorkingCapitalTurnover',
  name: '淨營運資金週轉率',
  unit: '次',
  formulaNote: '= 近四季營收加總 ÷ 淨營運資金（流動資產-流動負債），衡量每一元淨營運資金能支撐多少營收。',
  formulaLatex: '\\mathrm{NWC\\ Turnover} = \\dfrac{\\mathrm{Revenue}_{\\mathrm{TTM}}}{\\mathrm{CurrentAssets} - \\mathrm{CurrentLiabilities}}',
  tier: 'derived',
  sources: ['資產負債表（XBRL）', '損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['current_assets', 'current_liabilities', 'revenue'],
  currentFormulaVersion: 1,
};
