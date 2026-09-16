import { Router } from 'ultimate-express';
import rateLimit from 'express-rate-limit';
import { runBatchCompute, type BatchRunnerDeps } from '@/application/batch/runner';
import { quarterlyIndicatorJobs } from '@/application/batch/quarterly/indicatorRegistry';
import { jsonRoute } from '@/http/route';

// 給 GCP Cloud Scheduler 觸發用的 HTTP 入口（同步呼叫，說明見 ../daily/route.ts）。2026-09-07 起
// `quarterlyIndicatorJobs` 是空陣列——原本登記的 34 支舊架構指標已經全部 DROP，這支端點呼叫了會立刻回應
// （空跑），不會有逾時問題；之後如果重新登記新的季度型指標、數量夠多到會跑好幾分鐘，再改非同步模式。
// 沒有驗證機制（HttpModule auth: 'batch'），理由同 daily/route.ts。
export const createQuarterlyBatchRouter = (deps: BatchRunnerDeps): Router => {
  const router = Router();

  // 2026-09-05：獨立的 limiter 實例——跟 daily/route.ts 的 limiter 不是同一個物件，
  // express-rate-limit 預設用 req.ip 當 key，兩支端點如果共用同一個 limiter 實例會共用同一份
  // 計數（誤觸發彼此的額度），一定要各自 new 一個才是真的各自 5 次/小時。
  const batchComputeRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 小時
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'quarterly 批次計算端點觸發過於頻繁，請稍後再試（這不是身份驗證，只是防止連線池被打爆的暫時性防護）。' },
  });

  router.post(
    '/batch/compute/quarterly',
    batchComputeRateLimit,
    ...jsonRoute({}, async () => {
      await runBatchCompute(quarterlyIndicatorJobs, deps);
      return { message: 'quarterly 批次計算完成。' };
    })
  );

  return router;
};
