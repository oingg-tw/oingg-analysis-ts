import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankCet1RatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankCet1Ratio',
  displayName: '銀行普通股權益第一類資本比率 (CET1)',
  unit: '%',
  formulaNote: '普通股權益比率（CET1），直接讀 bank_capital_adequacy_detail_xbrl 已經算好的 ratio_ordinary_share_equity_to_rwa，覆蓋率/頻率限制同 bankCarRatio。',
  // CET1 是 Basel III 監理框架定義的概念，出處是 BCBS（巴塞爾銀行監理委員會）官方文件，
  // 不是期刊論文——bis.org 官方頁面明確定義 4.5% 最低要求跟 CET1 概念。沒有中文/英文維基
  // 專屬條目（Tier 1 capital 條目只有一句話提到，內容太薄不足以當 referenceUrl）。
  academicSourceUrl: 'https://www.bis.org/publ/bcbs189.htm',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['ratioOrdinaryShareEquityToRwa'],
  currentFormulaVersion: 1,
};
