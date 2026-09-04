// 批次入口的薄殼觸發器——跟 API 入口的 route.ts 是同一種角色，實際邏輯在
// src/domainBatch/runner.ts。觸發方式：手動跑 `pnpm batch:compute`；原本設計給
// dist/scripts/batchComputeIndicators.js 當 GCP Cloud Scheduler → Cloud Run Job 的觸發
// 目標（見 deploy/job.yaml），2026-09-04 起 src/domainBatch/route.ts 的 HTTP 路線已經接上，
// 這條 CLI 路線何去何從還沒決定，先保留當手動觸發管道。
//
// 這支腳本是短命的 CLI process（跑完就結束），才需要在這裡明確斷開連線讓 process 能正常
// 結束——runBatchCompute() 本身刻意不管連線生命週期（也被跑在長駐伺服器裡的 HTTP route
// 共用，不能讓它幫忙斷線），見 runner.ts 的說明。

import { runBatchCompute } from '../src/domainBatch/runner';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import tpexExportPrisma from '../src/adapters/prisma/tpexExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

runBatchCompute()
  .catch((error) => {
    console.error('批次預算腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await tpexExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
