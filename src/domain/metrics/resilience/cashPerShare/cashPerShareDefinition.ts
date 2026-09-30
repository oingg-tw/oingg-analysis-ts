import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-30 使用者同意 web-nuxt 的需求新增：每股利息收入（interestRevenuePerShare，元）的頁面要並排一條「現金部位」的線才看得出
// 利息收入從哪來，而既有的現金類指標（cashRatio、cashToAssetsRatio）單位都是 %，不能跟元共軸。資產負債表時點快照，跟 bvps 同一種
// 形狀：只有 Q 一種 basis，沒有 TTM（存量沒有「近四季加總」的意思）。
export const cashPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'cashPerShare',
  name: '每股現金及約當現金',
  unit: '元',
  perShare: true,
  formulaNote:
    '= 本季期末現金及約當現金*1000/流通股數。流通股數 = 已發行 − 特別股 − 庫藏股（IAS 33，跟 bvps 同一個分母）。' +
    '純資產負債表時點快照，只有 Q 一種 basis，沒有 TTM。',
  formulaLatex: '\\mathrm{CashPerShare} = \\frac{\\mathrm{CashAndCashEquivalents}}{\\mathrm{OutstandingCommonShares}}',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['cash_and_cash_equivalents', 'outstandingCommonShares'],
  currentFormulaVersion: 1,
};
