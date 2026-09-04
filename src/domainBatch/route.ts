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

/**
 * @swagger
 * /batch/compute:
 *   post:
 *     summary: 觸發全市場批次預算（44 支指標 x 全部公司），給 GCP Cloud Scheduler 用
 *     description: >
 *       跟 domainApi 的各支指標端點共用同一份計算邏輯（見
 *       [`src/domainBatch/metrics/`](./metrics/)），差別是這支端點一次跑全市場每家公司，
 *       不是單一公司查詢。實際邏輯在
 *       [`src/domainBatch/runner.ts`](./runner.ts) 的 `runBatchCompute`，跑完才回應（同步），
 *       視資料量可能要好幾分鐘，呼叫方逾時設定要抓夠長。
 *
 *       **目前沒有身份驗證**——正式環境部署前要靠 Cloud Run IAM invoker 權限（只允許指定的
 *       Scheduler 服務帳號呼叫）或額外的共用密鑰機制擋住，不能公開曝露，見
 *       `controller.ts` 的說明。2026-09-05 先加上每小時 5 次的 rate limit 當臨時防護
 *       （超過回 429），不是驗證機制的替代品，只是在正式驗證接上之前先擋住最直接的濫用情境。
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: 批次計算完成。
 *       429:
 *         description: 超過每小時 5 次的觸發上限（暫時性防護，不是驗證失敗）。
 *       500:
 *         description: 批次計算過程中發生未預期錯誤（單一公司/單一指標失敗會被
 *           `runWithConcurrency` 接住繼續跑下一個，不會走到這裡；這裡是連線建立不起來等
 *           更根本的失敗）。
 */
router.post('/batch/compute', batchComputeRateLimit, triggerBatchCompute);

export default router;
