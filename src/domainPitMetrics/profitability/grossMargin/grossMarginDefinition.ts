import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 第五批遷移（第二層：margins/turnoverRatio 補完整，共 10 個 metric_code）：不動
  // netProfitMargin/assetTurnover（已由 computeDupontFamilyPit.ts 寫入），這裡只補這兩支
  // 舊架構檔案裡還沒做的其餘欄位。grossMargin/operatingMargin 由
  // src/domainPitMetrics/profitability/margins/computeMarginsFamilyPit.ts 一次查詢寫入；
  // inventoryTurnover/receivablesTurnover/fixedAssetTurnover/payablesTurnover/
  // inventoryDays/receivablesDays/payablesDays/cashConversionCycle 由
  // src/domainPitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit.ts 一次查詢寫入（跟
  // Dupont 家族同一種「一次查詢拆多個 metric_code」模式）。
export const grossMarginDefinition: MetricDefinitionSpec = {
  metricCode: 'grossMargin',
  displayName: '毛利率',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季毛利/本季營收*100；TTM = 近四季（含本季）毛利加總/近四季營收加總*100。' +
    '沒有 Q_ANN——flow/flow 比率年化沒有意義。',
  formulaLatex: '\\mathrm{GrossMargin} = \\frac{\\mathrm{GrossProfit}}{\\mathrm{Revenue}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%AF%9B%E5%88%A9%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '保險業損益明細表（XBRL，保險業適用）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['gross_profit', 'revenue'],
  currentFormulaVersion: 1,
};
