import { Router } from 'ultimate-express';
import type { AppDeps } from '@/application/deps';
import { scanMetricFolderCatalog } from '@/application/metrics/metricFolderCatalog';
import { getDataVersion } from '@/application/metrics/dataVersion';
import { jsonRoute } from '@/http/route';

// GET /metrics：指標目錄（分類 → 指標 → 可用 timeframe/badge），純讀 application 的 catalog。
// GET /data-version：2026-10-08 新增，下游的快取版本鍵（見 application/metrics/dataVersion.ts）。
export const createMetricsRouter = (deps: Pick<AppDeps, 'metricValueQueries'>): Router => {
  const router = Router();

  // 2026-10-10 詞彙表：徽章 threshold.percentileRank 的 direction → order，舊 key 並存到 2026-10-24（http/route.ts 的 RETIRED_RESPONSE_KEYS_REMOVED_ON）。
  // 只在這支補，不放進全域的 withRetiredKeys：排行端點的回應也有 order（回顯查詢參數），放全域會在那些端點冒出 direction。
  const withRetiredBadgeDirection = (categories: unknown): unknown =>
    JSON.parse(JSON.stringify(categories), (key, value: unknown) =>
      key === 'percentileRank' && value !== null && typeof value === 'object' && 'order' in value ? { ...value, direction: (value as { order: unknown }).order } : value
    );
  router.get('/metrics', ...jsonRoute({}, async () => ({ categories: withRetiredBadgeDirection(scanMetricFolderCatalog()) })));
  router.get('/data-version', ...jsonRoute({}, () => getDataVersion(deps)));

  return router;
};
