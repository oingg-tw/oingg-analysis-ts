import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——見
// src/domainPitMetrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamilyPit.ts
// 檔頭說明，只有 TTM 一種 basis。
export const evToSalesDefinition: MetricDefinitionSpec = {
  metricCode: 'evToSales',
  name: 'EV/Sales',
  unit: '倍',
  formulaNote: '= 企業價值（市值+淨負債） ÷ 近四季營收加總。跟 evEbitda 共用同一套企業價值計算，只是分母改用營收。',
  formulaLatex: '\\mathrm{EV/Sales} = \\dfrac{\\mathrm{EnterpriseValue}}{\\mathrm{Revenue}_{\\mathrm{TTM}}}',
  referenceUrl: 'https://www.investopedia.com/terms/e/enterprisevaluerevenuemultiple.asp',
  tier: 'derived',
  sources: ['資產負債表（XBRL）', '損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['revenue', 'assets', 'liabilities', 'cash_and_cash_equivalents', 'paidInShares'],
  currentFormulaVersion: 1,
};
