import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// metric_definitions 表——2026-09-09 起只有一個 spec JSON 欄位，直接存整個 MetricDefinitionSpec，
// 不做任何形狀轉換；src/ 內沒有讀取端（write-only，bff-ts 也確認沒有直連），寫入純粹是留紀錄。
// 2026-09-17 重構 Phase 2 從 application/metrics/metricDefinitionRegistry.ts 搬來，registry
// 從此不碰 Prisma。冪等，backfill 腳本開跑前呼叫一次即可。
export const upsertMetricDefinition = async (spec: MetricDefinitionSpec): Promise<void> => {
  await analysisPrisma.metricDefinition.upsert({
    where: { metricCode: spec.metricCode },
    create: { metricCode: spec.metricCode, spec },
    update: { spec },
  });
};
