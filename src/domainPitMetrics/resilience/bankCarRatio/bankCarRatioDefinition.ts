import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankCarRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankCarRatio',
  displayName: '銀行資本適足率',
  unit: '%',
  formulaNote:
    '資本適足率 = eligible_capital / risk_weighted_assets * 100——這批唯一自己做除法的' +
    '欄位（其餘都是直接讀 mops-ts 算好的比率）。資料源 bank_capital_adequacy_detail_xbrl' +
    '只覆蓋 6-7 檔銀行/金控股，且只有 Q2/Q4 有真實值（監理揭露頻率本來就是半年一次，' +
    'Q1/Q3 一律 missing_input，不是資料缺漏）。不給 year/season 時的「最新一季」判斷刻意' +
    '排除值為 null 的季度，見 getLatestQuarterWithBankCapitalAdequacy 的說明。',
  formulaLatex: '\\mathrm{CAR} = \\frac{\\mathrm{EligibleCapital}}{\\mathrm{RiskWeightedAssets}} \\times 100',
  // 資本適足率是 Basel III 監理框架的核心概念，出處是 BCBS 官方文件（跟 bankCet1Ratio/
  // bankTier1Ratio 同一份）。
  academicSourceUrl: 'https://www.bis.org/publ/bcbs189.htm',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%B3%87%E6%9C%AC%E9%81%A9%E8%B6%B3%E7%8E%87',
  tier: 'derived',
  sources: ['銀行監理財務資訊揭露（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['eligibleCapital', 'riskWeightedAssets'],
  currentFormulaVersion: 1,
};
