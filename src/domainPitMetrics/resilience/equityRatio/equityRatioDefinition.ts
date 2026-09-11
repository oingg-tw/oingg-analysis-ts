import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——單季即可，見
// computeEquityRatioPit.ts 檔頭說明。只有 Q 一種 basis。
export const equityRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'equityRatio',
  displayName: '股東權益比率',
  unit: '%',
  formulaNote: '= 股東權益總額 ÷ 資產總額，衡量資產有多少比例是股東自有資金支應（跟 debtRatio/equityMultiplier 互為對照）。',
  formulaLatex: '\\mathrm{EquityRatio} = \\dfrac{\\mathrm{Equity}}{\\mathrm{TotalAssets}}',
  tier: 'derived',
  sources: ['資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['equity', 'assets'],
  currentFormulaVersion: 1,
};
