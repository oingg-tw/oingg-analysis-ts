import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const dividendCoverageRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendCoverageRatio',
  displayName: '股利保障倍數（現金流量）',
  unit: '倍',
  formulaNote:
    'TTM = 近四季自由現金流（FCF = 營業活動現金流 + 資本支出，資本支出來源資料是負值/流出）' +
    '加總 / |近四季股利發放現金加總|。跟 dividendPayoutRatio（分母用「淨利」，會計盈餘角度）' +
    '是互補指標，故意分開不合併——這支衡量配息是不是真的靠自由現金流撐得住，還是得舉債/賣' +
    '資產硬發。TTM 股利發放現金加總為 0（沒配息）時比率沒有意義，回傳 null' +
    '（zero_or_negative_denominator），不是無限大或 0。只有 TTM 一種 basis——理由跟' +
    ' dividendPayoutRatio 一致，股利通常一年發放 1-2 次，單季會嚴重失真。',
  formulaLatex: '\\mathrm{DividendCoverageRatio} = \\frac{\\sum_{i=1}^{4}\\mathrm{FCF}_i}{\\left|\\sum_{i=1}^{4}\\mathrm{DividendsPaid}_i\\right|}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend_cover',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['netCashFromOperatingActivities', 'capitalExpenditures', 'dividendsPaid'],
  currentFormulaVersion: 1,
};
