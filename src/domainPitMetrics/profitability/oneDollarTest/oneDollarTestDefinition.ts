import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const oneDollarTestDefinition: MetricDefinitionSpec = {
  metricCode: 'oneDollarTest',
  name: '一美元原則',
  nameEn: 'One Dollar Premise',
  unit: '倍',
  formulaNote:
    '= (最近一個完整會計年度 Q4 市值 - 5 年前同一時點市值) / (近 5 個完整會計年度累計淨利' +
    ' - 累計股利發放現金) 。分母（累計保留盈餘）為 0 或負值時比率沒有意義，回傳 null' +
    '（zero_or_negative_denominator）。5 年窗口任一年度四季資料不齊全，回傳 null' +
    '（insufficient_history）。只有 FY 一種 basis——這是長期資本配置能力的檢驗，季度' +
    '數字沒有意義。',
  formulaLatex: '\\mathrm{OneDollarTest} = \\frac{\\Delta \\mathrm{MarketCap}}{\\sum \\mathrm{NetIncome} - \\sum |\\mathrm{DividendsPaid}|}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Warren_Buffett',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'dividendsPaid', 'marketCap'],
  currentFormulaVersion: 1,
};
