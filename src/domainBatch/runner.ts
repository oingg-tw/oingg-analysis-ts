// 批次入口的實際執行邏輯——跟 API 入口（src/domainApi/**/{controller,route}.ts）平行的另一個
// 入口，2026-09-04 從 scripts/batchComputeIndicators.ts 抽出來，讓那支腳本縮成薄殼觸發器
// （跟 route.ts 之於 controller.ts 同一種角色）。這裡才是「跑全市場、控制併發」的實際邏輯。
//
// 2026-09-04 起有兩種觸發方式，都呼叫同一支 runBatchCompute：
// 1. HTTP：src/domainBatch/route.ts 的 `POST /batch/compute`，給 GCP Cloud Scheduler 直接
//    打，跟 domainApi 共用同一個 Cloud Run Service（長駐行程）。
// 2. CLI：scripts/batchComputeIndicators.ts（`pnpm batch:compute`），原本設計給
//    deploy/job.yaml 的 Cloud Run Job 用，現在 HTTP 路線已經接上，這條路線何去何從（保留
//    當手動觸發管道、還是整個退役）還沒決定，先兩條都留著。
// 這支函式本身刻意設計成沒有連線生命週期管理的副作用（見結尾說明），方便被這兩種觸發方式共用。
//
// 全市場批次預算——直接呼叫現有的 calculate* 函式（不透過 HTTP），逐一幫「目前實際查得到的
// 每一家公司」把指標算過一輪、upsert 進對應的 analysis 表。這是快取的預先填充，不是新的計算
// 邏輯——每支指標的公式/優雅降級規則完全沿用各自 service.ts 既有的實作，job 清單本身在
// src/domainBatch/indicatorRegistry.ts。
//
// 兩種公司清單來源，動態查詢、不寫死清單或數量（見 2026-08-31 的盤點）：
// - mops 季度財報（quarterly_income_statement）目前只 ingest 過 27 家公司，`profitability`/
//   `cashFlow`/`solvency`/`turnover`/`guru`/`valuation` 的 psr/pFcf/evEbitda 這批指標受限於此，
//   不是這支腳本能解決的，mops-ts ingest 更多公司財報後這裡會自動涵蓋，不用改程式碼。
// - twse `daily_price`／twse+tpex `daily_valuation` 涵蓋 1,000+ 家，`portfolio/beta`、
//   `technicals` 8 個指標、`valuation/marketRatios` 走這條路線。

import { indicatorJobs } from './indicatorRegistry';

// 小併發，對齊現有 Prisma client 的 connection_limit=5 池大小設定，不要一次打爆連線池。
const CONCURRENCY = 5;

const runWithConcurrency = async (companyIds: string[], run: (id: string) => Promise<unknown>): Promise<{ success: number; failed: string[] }> => {
  let success = 0;
  const failed: string[] = [];
  let index = 0;

  const worker = async () => {
    while (index < companyIds.length) {
      const id = companyIds[index++]!;
      try {
        await run(id);
        success++;
      } catch (error) {
        failed.push(id);
        console.error(`  ✖ ${id}:`, error instanceof Error ? error.message : error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companyIds.length) }, worker));
  return { success, failed };
};

// 2026-09-04：這裡刻意不斷開任何 Prisma client 連線——一開始（只有 CLI 腳本會呼叫這支
// 函式時）結尾有斷線，那時候是對的，因為 CLI 腳本跑完就要讓 process 結束。現在
// domainBatch/route.ts 也會在跟 domainApi 共用的同一個長駐伺服器行程裡呼叫這支函式，
// 斷線會把其他端點也在用的共用連線一起斷掉。「跑完要不要斷線」交給呼叫端自己決定
// （CLI 腳本結尾斷、HTTP route 結尾不斷），不是這支函式該管的事。
export const runBatchCompute = async (): Promise<void> => {
  for (const job of indicatorJobs) {
    const companyIds = await job.getCompanyIds();
    console.log(`[${job.name}] 開始，共 ${companyIds.length} 家公司`);
    const { success, failed } = await runWithConcurrency(companyIds, job.run);
    console.log(`[${job.name}] 完成：成功 ${success}，失敗 ${failed.length}${failed.length > 0 ? `（${failed.join(', ')}）` : ''}`);
  }
};
