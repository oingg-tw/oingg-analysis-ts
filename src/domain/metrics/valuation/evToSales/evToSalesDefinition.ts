import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——見
// src/domainPitMetrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamilyPit.ts
// 檔頭說明，只有 TTM 一種 basis。
export const evToSalesDefinition: MetricDefinitionSpec = {
  metricCode: 'evToSales',
  name: '企業價值營收比',
  nameEn: 'EV/Sales',
  unit: '倍',
  formulaNote: '= 企業價值（市值+淨負債） ÷ 近四季營收加總。跟 evEbitda 共用同一套企業價值計算，只是分母改用營收。（2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股，已發行 − 特別股 − 庫藏股。）',
  formulaLatex: '\\mathrm{EVToSales} = \\dfrac{\\mathrm{EnterpriseValue}}{\\mathrm{Revenue}_{\\mathrm{TTM}}}',
  referenceUrl: 'https://www.investopedia.com/terms/e/enterprisevaluerevenuemultiple.asp',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['current_cp_issued_and_portion', 'longterm_liabilities_current_portion', 'revenue', 'assets', 'liabilities', 'cash_and_cash_equivalents', 'outstandingCommonShares'],
  currentFormulaVersion: 3,
};
