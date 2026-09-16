import { Router } from 'ultimate-express';
import type { BatchRunnerDeps } from '@/application/batch/runner';
import { createDailyBatchRouter } from './daily/route';
import { createQuarterlyBatchRouter } from './quarterly/route';

// 2026-09-05 起薄殼合併層——實際路由掛載在 ./daily/route.ts、./quarterly/route.ts
// （各自獨立的 rate limiter 實例，見那兩支檔案的說明）。bootstrap/httpModules.ts 只認這個檔案，
// 不用知道底下拆成兩個資料夾。
export const createBatchRouter = (deps: BatchRunnerDeps): Router => {
  const router = Router();
  router.use(createDailyBatchRouter(deps));
  router.use(createQuarterlyBatchRouter(deps));
  return router;
};
