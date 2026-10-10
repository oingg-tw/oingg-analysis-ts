import { Router } from 'ultimate-express';
import type { AppDeps } from '@/application/deps';
import { scanMetricFolderCatalog } from '@/application/metrics/metricFolderCatalog';
import { getDataVersion } from '@/application/metrics/dataVersion';
import { jsonRoute } from '@/http/route';

// GET /metrics：指標目錄（分類 → 指標 → 可用 timeframe/badge），純讀 application 的 catalog。
// GET /data-version：2026-10-08 新增，下游的快取版本鍵（見 application/metrics/dataVersion.ts）。
export const createMetricsRouter = (deps: Pick<AppDeps, 'metricValueQueries'>): Router => {
  const router = Router();

  router.get('/metrics', ...jsonRoute({}, async () => ({ categories: scanMetricFolderCatalog() })));
  router.get('/data-version', ...jsonRoute({}, () => getDataVersion(deps)));

  return router;
};
