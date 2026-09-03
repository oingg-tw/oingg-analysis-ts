// 批次入口的薄殼觸發器——跟 API 入口的 route.ts 是同一種角色，實際邏輯在
// src/domainBatch/runner.ts。觸發方式：手動跑 `pnpm batch:compute`；發布後這支編譯產物
// （dist/scripts/batchComputeIndicators.js）會是 GCP Cloud Scheduler → Cloud Run Job 的
// 觸發目標，見 deploy/job.yaml。

import { runBatchCompute } from '../src/domainBatch/runner';

runBatchCompute().catch((error) => {
  console.error('批次預算腳本執行失敗：', error);
  process.exit(1);
});
