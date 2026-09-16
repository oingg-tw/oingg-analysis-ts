// scripts/整合測試寫 metric_definitions 的唯一入口——registry 本身（application/metrics/metricDefinitionRegistry.ts）
// 從此不碰 Prisma，也不再 re-export infrastructure 的 upsert（那是 application → infrastructure 的反向依賴）。
// 跟 src/bootstrap/pitMetrics.ts 分開一個檔案：pitMetrics.ts 是 codemod 產生的，手寫的綁定不混進去。
export { upsertMetricDefinition } from '@/infrastructure/repositories/analysis/metricDefinitionRepository';
