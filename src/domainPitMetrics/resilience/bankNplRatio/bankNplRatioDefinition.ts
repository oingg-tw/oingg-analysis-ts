import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 2026-09-06 新增——銀行業專屬指標，全新指標不是舊架構遷移（src/domainMetrics/ 從來沒有
  // 銀行業指標的既有檔案）。資料來自 mops-ts 銀行監理揭露 XBRL 表（不是 xbrl_three_
  // statements_long 三大表那套 account_code），dependsOn 直接用查詢層的 camelCase 欄位
  // 名稱。都只有 Q 一種 basis（資產負債表時點快照，沒有 TTM/年化概念）。
export const bankNplRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'bankNplRatio',
  displayName: '銀行逾期放款比率',
  unit: '%',
  formulaNote:
    '全行逾放比，直接讀 mops-ts 的 bank_asset_quality_xbrl（category=\'TotalLoans\'）已經算好的' +
    'non_performing_loans_ratio，不用自己推公式。覆蓋約 19-20 檔銀行/金控股，每季都有資料；' +
    '非銀行公司一律優雅降級成 missing_input，不做前置的「這家公司是不是銀行」判斷。',
  // NPL ratio 不是 Basel III 資本框架概念，是 IMF 官方定義的核心金融穩健指標（FSI）之一，
  // 出處是 IMF Financial Soundness Indicators Compilation Guide (2019)。中文維基「不良貸款」
  // 條目內容偏薄（只有一段定義，沒有公式），仍勉強夠格當 referenceUrl（主題明確相關，不是
  // 湊數）。
  academicSourceUrl: 'https://www.imf.org/-/media/files/data/2019/2019-fsi-guide.pdf',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E4%B8%8D%E8%89%AF%E8%B2%B8%E6%AC%BE',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['nonPerformingLoansRatio'],
  currentFormulaVersion: 1,
};
