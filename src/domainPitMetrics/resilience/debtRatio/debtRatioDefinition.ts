import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 第四批遷移（resilience/turnover/valuation 簡單型 11 支舊架構檔案，共 13 個
  // metric_code）：debtRatio/currentRatio/quickRatio/cashRatio/deRatio/interestCoverage/
  // netDebtToEbitda/capexToRevenue/roic/roce 都是獨立重新實作，不呼叫任何 calculateXxx()。
  // currentRatio/quickRatio/cashRatio 由 src/domainPitMetrics/resilience/liquidityRatio/computeLiquidityRatioPit.ts
  // 一次查詢寫三個 metric_code（跟 Dupont 家族同一種處理）。psr/pFcf/evEbitda 第一次用到
  // 市值（getMarketCapAsOf）——複用 resolveKnowledgeDate 算出的 knowledgeDate 去查，跟
  // 第三批 fcfYield 發現的「股價/市值不需要另外設計 knowledge_date 機制」一致；三者都是
  // 獨立重新計算子公式鏈（不依賴 revenuePerShare/cashFlowPerShare/netDebtToEbitda 這些
  // 已寫入的 metric_value）。
export const debtRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'debtRatio',
  displayName: '負債比率',
  unit: '%',
  formulaNote: '= 本季期末總負債/本季期末總資產*100。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{DebtRatio} = \\frac{\\mathrm{TotalLiabilities}}{\\mathrm{TotalAssets}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%B3%87%E7%94%A2%E8%B2%A0%E5%82%B5%E7%8E%87',
  tier: 'derived',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['liabilities', 'assets'],
  currentFormulaVersion: 1,
};
