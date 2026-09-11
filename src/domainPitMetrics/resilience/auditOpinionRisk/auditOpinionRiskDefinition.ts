import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 應 web-nuxt/bff-ts 要求新增——查核意見類型的風險分數版本，見
// computeAuditOpinionRiskPit.ts 檔頭說明。分類值編碼成序列風險分數（0~4），不是財報數字
// 的四則運算，沒有具名學術出處（不是複合模型），tier 定為 raw（直接反映來源分類，本服務
// 不做任何計算，只是編碼）。只有 Q 一種 basis，不加 badge（沒有單一常數門檻適用所有
// 使用情境，「風險分數 < N」這種篩選邏輯留給呼叫端自己決定要用哪個切點）。
export const auditOpinionRiskDefinition: MetricDefinitionSpec = {
  metricCode: 'auditOpinionRisk',
  displayName: '查核意見風險分數',
  unit: '分',
  formulaNote:
    '查核意見類型編碼成 0~4 的序列風險分數：0=無保留意見（最乾淨）、1=無保留意見（強調事項段）、' +
    '2=繼續經營重大不確定性、3=保留意見、4=無法表示意見（最嚴重）。來源是會計師出具的查核報告' +
    '（mops-ts export.audit_scope_xbrl 的 5 個互斥旗標），不是本服務計算出來的比率。查無資料或' +
    '落在未涵蓋分類（例如否定意見）時為 null（missing_input）。',
  referenceUrl: 'https://www.iaasb.org/focus-areas/auditor-reporting',
  tier: 'raw',
  sources: ['會計師查核報告（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['qualified_opinion', 'unqualified_opinion', 'unqualified_opinion_with_emphasis', 'unqualified_opinion_with_going_concern', 'disclaimer_of_opinion'],
  currentFormulaVersion: 1,
};
