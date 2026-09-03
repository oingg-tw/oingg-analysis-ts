// 批次入口的實際執行邏輯——跟 API 入口（src/domainApi/**/{controller,route}.ts）平行的另一個
// 入口，2026-09-04 從 scripts/batchComputeIndicators.ts 抽出來，讓那支腳本縮成薄殼觸發器
// （跟 route.ts 之於 controller.ts 同一種角色）。這裡才是「跑全市場、控制併發」的實際邏輯。
//
// 之後要發布給 GCP Cloud Scheduler 用時，觸發的是 scripts/batchComputeIndicators.ts 編譯後的
// 產物（Cloud Run Job，排程觸發、跑一次就結束，見 deploy/job.yaml），不是直接呼叫這個檔案——
// 這裡刻意設計成一個沒有副作用的 `runBatchCompute()` 函式，方便之後如果要幫批次入口寫測試、
// 或是被別的觸發方式（不只 CLI）呼叫時不用重寫。
//
// 全市場批次預算——直接呼叫現有的 calculate* 函式（不透過 HTTP），逐一幫「目前實際查得到的
// 每一家公司」把指標算過一輪、upsert 進對應的 analysis 表。這是快取的預先填充，不是新的計算
// 邏輯——每支指標的公式/優雅降級規則完全沿用各自 service.ts 既有的實作，job 清單本身在
// src/domainBatch/indicatorRegistry.ts（跟 src/domainApi/dataCompleteness/ 共用同一份，不要
// 兩邊各維護一份容易漂移）。
//
// 兩種公司清單來源，動態查詢、不寫死清單或數量（見 2026-08-31 的盤點）：
// - mops 季度財報（quarterly_income_statement）目前只 ingest 過 27 家公司，`profitability`/
//   `cashFlow`/`solvency`/`turnover`/`guru`/`valuation` 的 psr/pFcf/evEbitda 這批指標受限於此，
//   不是這支腳本能解決的，mops-ts ingest 更多公司財報後這裡會自動涵蓋，不用改程式碼。
// - twse `daily_price`／twse+tpex `daily_valuation` 涵蓋 1,000+ 家，`portfolio/beta`、
//   `technicals` 8 個指標、`valuation/marketRatios` 走這條路線。

import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
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

export const runBatchCompute = async (): Promise<void> => {
  for (const job of indicatorJobs) {
    const companyIds = await job.getCompanyIds();
    console.log(`[${job.name}] 開始，共 ${companyIds.length} 家公司`);
    const { success, failed } = await runWithConcurrency(companyIds, job.run);
    console.log(`[${job.name}] 完成：成功 ${success}，失敗 ${failed.length}${failed.length > 0 ? `（${failed.join(', ')}）` : ''}`);
  }

  await mopsExportPrisma.$disconnect();
  await twseExportPrisma.$disconnect();
  await tpexExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
};
