import { Router } from 'ultimate-express';
import rateLimit from 'express-rate-limit';
import { triggerBatchCompute } from './controller';

const router = Router();

// 這支端點目前沒有身份驗證（見下方 swagger 說明），rate limit 不是取代驗證，只是在正式接上
// Cloud Run IAM/共用密鑰之前，先擋掉「被亂打導致連線池打爆」這個最直接的濫用情境。
// Cloud Scheduler 正常觸發頻率頂多一天幾次，這個上限對正常用途完全沒有影響。
const batchComputeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小時
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '批次計算端點觸發過於頻繁，請稍後再試（這不是身份驗證，只是防止連線池被打爆的暫時性防護）。' },
});

router.post('/batch/compute', batchComputeRateLimit, triggerBatchCompute);

export default router;
