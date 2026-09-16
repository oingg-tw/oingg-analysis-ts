import { Router } from 'ultimate-express';
import rateLimit from 'express-rate-limit';
import { runBatchCompute, type BatchRunnerDeps } from '@/application/batch/runner';
import { dailyIndicatorJobs } from '@/application/batch/daily/indicatorRegistry';
import { jsonRoute } from '@/http/route';

// 給 GCP Cloud Scheduler 觸發用的 HTTP 入口，呼叫方是排程器不是 BFF。目前刻意做成「整個批次跑完才回應」的
// 同步呼叫，是這個階段最簡單能動的版本，不是最終設計：10 支指標 x 1000+ 家公司實際會跑一段時間，Cloud Run
// Service 的 request timeout（可設到 60 分鐘）跟 Cloud Scheduler 本身的逾時上限都要另外調整才扛得住；等真的
// 接近這個上限造成逾時失敗，再改成「收到請求先回 202、背景繼續跑」的非同步模式。
//
// 目前沒有任何驗證機制擋這支端點——跟 bff 端點不一樣，這支是刻意留在 bffAuth 的驗證範圍之外（HttpModule
// auth: 'batch'），因為呼叫方是 Cloud Scheduler 不是 bff-ts，不該共用同一把密鑰。正式部署前至少要靠 Cloud Run
// 的 IAM invoker 權限（只有指定的 Scheduler 服務帳號能呼叫）擋住，不能公開曝露。2026-09-17 使用者拍板維持現狀。
export const createDailyBatchRouter = (deps: BatchRunnerDeps): Router => {
  const router = Router();

  // rate limit 不是取代驗證，只是在正式接上 Cloud Run IAM 之前，先擋掉「被亂打導致連線池打爆」這個最直接的
  // 濫用情境。Cloud Scheduler 正常觸發頻率頂多一天幾次，這個上限對正常用途完全沒有影響。
  //
  // 2026-09-05：獨立的 limiter 實例——跟 quarterly/route.ts 的 limiter 不是同一個物件，
  // express-rate-limit 預設用 req.ip 當 key，兩支端點如果共用同一個 limiter 實例會共用同一份
  // 計數（誤觸發彼此的額度），一定要各自 new 一個才是真的各自 5 次/小時。
  const batchComputeRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 小時
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'daily 批次計算端點觸發過於頻繁，請稍後再試（這不是身份驗證，只是防止連線池被打爆的暫時性防護）。' },
  });

  router.post(
    '/batch/compute/daily',
    batchComputeRateLimit,
    ...jsonRoute({}, async () => {
      await runBatchCompute(dailyIndicatorJobs, deps);
      return { message: 'daily 批次計算完成。' };
    })
  );

  return router;
};
