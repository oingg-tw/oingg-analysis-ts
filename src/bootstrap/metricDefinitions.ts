// scripts/整合測試寫 metric_definitions 的唯一入口——registry 本身（application/metrics/metricDefinitionRegistry.ts）
// 從此不碰 Prisma，也不再 re-export infrastructure 的 upsert（那是 application → infrastructure 的反向依賴）。
// 跟 src/bootstrap/pitMetrics.ts 分開一個檔案：pitMetrics.ts 是 codemod 產生的，手寫的綁定不混進去。
export { upsertMetricDefinition } from '@/infrastructure/repositories/analysis/metricDefinitionRepository';
// registry 本身是 application 的靜態資料，scripts 不能直接 import application，一併從這裡出口。
export { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
// 2026-09-20 給 scripts/scanBannedWords.ts 用：Piotroski 分組說明與訊號標籤是使用者可見文案，也要掃禁用詞。
export { PIOTROSKI_GROUP_METADATA, PIOTROSKI_SIGNAL_LABELS } from '@/application/metrics/quality/piotroskiFScore/piotroskiFScoreGroupMetadata';
