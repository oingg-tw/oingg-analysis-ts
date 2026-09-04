import { Router } from 'ultimate-express';
import rateLimit from 'express-rate-limit';
import { triggerDailyBatchCompute, triggerQuarterlyBatchCompute } from './controller';

const router = Router();

// 這兩支端點目前沒有身份驗證（見下方 swagger 說明），rate limit 不是取代驗證，只是在正式接上
// Cloud Run IAM 之前，先擋掉「被亂打導致連線池打爆」這個最直接的濫用情境。Cloud Scheduler
// 正常觸發頻率頂多一天幾次，這個上限對正常用途完全沒有影響。兩支各自獨立算額度，不共用。
const batchComputeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小時
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '批次計算端點觸發過於頻繁，請稍後再試（這不是身份驗證，只是防止連線池被打爆的暫時性防護）。' },
});

// 2026-09-05 拆成 daily/quarterly 兩支，取代原本單一的 POST /batch/compute（見
// indicatorRegistry.ts、controller.ts 開頭的說明）——這支端點還沒有正式部署、沒有外部
// 呼叫方依賴舊路徑，直接替換不用保留相容別名。
router.post('/batch/compute/daily', batchComputeRateLimit, triggerDailyBatchCompute);
router.post('/batch/compute/quarterly', batchComputeRateLimit, triggerQuarterlyBatchCompute);

export default router;
