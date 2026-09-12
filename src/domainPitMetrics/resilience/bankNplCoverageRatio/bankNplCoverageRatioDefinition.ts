import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankNplCoverageRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankNplCoverageRatio',
  name: '銀行備抵呆帳覆蓋率',
  unit: '%',
  formulaNote:
    '備抵呆帳覆蓋率，跟 bankNplRatio 同一列（bank_asset_quality_xbrl 的 TotalLoans）、' +
    '同一次查詢、同一組 knowledge_date，直接讀已經算好的 coverage_ratio。',
  // 跟 bankNplRatio 同一份 IMF FSI Guide（「備抵呆帳/不良貸款」是文件裡的相關核心指標），
  // 沒有專屬維基條目（不良貸款條目沒有涵蓋覆蓋率公式），referenceUrl 刻意留空。
  academicSourceUrl: 'https://www.imf.org/-/media/files/data/2019/2019-fsi-guide.pdf',
  tier: 'raw',
  sources: ['銀行監理財務資訊揭露（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['coverageRatio'],
  currentFormulaVersion: 1,
};
