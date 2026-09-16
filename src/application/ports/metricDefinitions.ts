import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 寫入前的座標驗證（spec v0.2 §5.5）要查 metricCode 的 definition——今天的來源是
// application/metrics/metricDefinitionRegistry.ts 這份靜態 registry，做成 lookup 介面注入是為了
// 讓 persistComputations 的單元測試只給一兩支 definition 就能跑，不用拖進整份 137 支的 registry
// （它目前還兼 upsertMetricDefinition，會連到 Prisma；Phase 3 收尾拆掉）。
export interface MetricDefinitionLookup {
  get(metricCode: string): MetricDefinitionSpec | undefined;
}
