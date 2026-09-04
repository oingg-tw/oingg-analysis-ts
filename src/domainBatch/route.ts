import { Router } from 'ultimate-express';
import { triggerBatchCompute } from './controller';

const router = Router();

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
 *       `controller.ts` 的說明。
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: 批次計算完成。
 *       500:
 *         description: 批次計算過程中發生未預期錯誤（單一公司/單一指標失敗會被
 *           `runWithConcurrency` 接住繼續跑下一個，不會走到這裡；這裡是連線建立不起來等
 *           更根本的失敗）。
 */
router.post('/batch/compute', triggerBatchCompute);

export default router;
