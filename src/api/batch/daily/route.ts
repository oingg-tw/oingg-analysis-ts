import { Router } from 'ultimate-express';
import rateLimit from 'express-rate-limit';
import { triggerDailyBatchCompute } from './controller';

const router = Router();

// 這支端點目前沒有身份驗證（見 controller.ts 說明），rate limit 不是取代驗證，只是在正式接上
// Cloud Run IAM 之前，先擋掉「被亂打導致連線池打爆」這個最直接的濫用情境。Cloud Scheduler
// 正常觸發頻率頂多一天幾次，這個上限對正常用途完全沒有影響。
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

router.post('/batch/compute/daily', batchComputeRateLimit, triggerDailyBatchCompute);

export default router;
