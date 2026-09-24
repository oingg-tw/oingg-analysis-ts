import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——見
// computeTurnoverRatioFamilyPit.ts 的擴充說明，只有 TTM 一種 basis。
export const receivablesToRevenueRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'receivablesToRevenueRatio',
  name: '應收帳款占營收比',
  unit: '%',
  formulaNote: '= 本季期末應收帳款 ÷ 近四季營收加總，衡量應收帳款水位相對於營收規模是否偏高。',
  formulaLatex: '\\mathrm{ReceivablesToRevenue} = \\dfrac{\\mathrm{Receivables}}{\\mathrm{Revenue}_{\\mathrm{TTM}}}',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['accounts_receivable_net', 'revenue'],
  currentFormulaVersion: 1,
};
