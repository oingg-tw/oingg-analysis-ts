// 全市場批次預算——直接呼叫現有的 calculate* 函式（不透過 HTTP），逐一幫「目前實際查得到的
// 每一家公司」把指標算過一輪、upsert 進對應的 analysis 表。這是快取的預先填充，不是新的計算
// 邏輯——每支指標的公式/優雅降級規則完全沿用各自 service.ts 既有的實作，job 清單本身在
// src/shared/indicatorRegistry.ts（跟 src/domains/dataCompleteness/ 共用同一份，不要兩邊
// 各維護一份容易漂移）。
//
// 兩種公司清單來源，動態查詢、不寫死清單或數量（見 2026-08-31 的盤點）：
// - mops 季度財報（quarterly_income_statement）目前只 ingest 過 27 家公司，`profitability`/
//   `cashFlow`/`solvency`/`turnover`/`guru`/`valuation` 的 psr/pFcf/evEbitda 這批指標受限於此，
//   不是這支腳本能解決的，mops-ts ingest 更多公司財報後這裡會自動涵蓋，不用改程式碼。
// - twse `daily_price`／twse+tpex `daily_valuation` 涵蓋 1,000+ 家，`portfolio/beta`、
//   `technicals` 8 個指標、`valuation/marketRatios` 走這條路線。
//
// 觸發方式：手動跑 `pnpm batch:compute`，比照使用者要求移除 `/system/sync/:backend/:dataset`
// 端點的決定，這次同樣不開 HTTP 觸發——排程要怎麼接、多久跑一次，是這支腳本驗證過之後的下一步。

import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import tpexExportPrisma from '../src/adapters/prisma/tpexExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';
import { indicatorJobs } from '../src/shared/indicatorRegistry';

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

const main = async () => {
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

main().catch((error) => {
  console.error('批次預算腳本執行失敗：', error);
  process.exit(1);
});
