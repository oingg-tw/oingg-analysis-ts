import { Router } from 'ultimate-express';
import { scanMetricFolderCatalog } from '@/application/metrics/metricFolderCatalog';
import { jsonRoute } from '@/http/route';

// GET /metrics：指標目錄（分類 → 指標 → 可用 timeframe/badge），純讀 application 的 catalog，沒有 deps。
export const createMetricsRouter = (): Router => {
  const router = Router();

  router.get('/metrics', ...jsonRoute({}, async () => ({ categories: scanMetricFolderCatalog() })));

  return router;
};
