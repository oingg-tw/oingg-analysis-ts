import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——跟既有 pFcf
// （P/FCF）是姊妹指標，分母改用 OCF 不扣資本支出。只有 TTM 一種 basis。
export const priceToOcfDefinition: MetricDefinitionSpec = {
  metricCode: 'priceToOcf',
  name: 'P/OCF',
  unit: '倍',
  formulaNote: '= 市值 ÷ 近四季營業活動現金流量加總。跟既有 pFcf（P/FCF）是姊妹指標，分母不扣資本支出。',
  formulaLatex: '\\mathrm{PriceToOCF} = \\dfrac{\\mathrm{MarketCap}}{\\mathrm{OCF}_{\\mathrm{TTM}}}',
  referenceUrl: 'https://www.investopedia.com/terms/p/price-to-cash-flow-ratio.asp',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['cash_flows_from_used_in_operating_activities', 'paidInShares'],
  currentFormulaVersion: 1,
};
