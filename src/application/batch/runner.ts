// 批次入口的實際執行邏輯——跟 HTTP 入口（http/modules/**/route.ts）平行的另一個入口，2026-09-04 從
// scripts/batchComputeIndicators.ts 抽出來，讓那支腳本縮成薄殼觸發器。這裡才是「跑全市場、控制併發」的實際邏輯。
//
// 2026-09-04 起有兩種觸發方式，都呼叫同一支 runBatchCompute：
// 1. HTTP：http/batch/route.ts 的 `POST /batch/compute/{daily,quarterly}`，給 GCP Cloud Scheduler 直接
//    打，跟 bff 端點共用同一個 Cloud Run Service（長駐行程）。
// 2. CLI：scripts/batchComputeIndicators.ts（`pnpm batch:compute`，經 src/bootstrap/batch.ts 綁定 deps），原本設計給
//    deploy/job.yaml 的 Cloud Run Job 用，現在 HTTP 路線已經接上，這條路線何去何從（保留
//    當手動觸發管道、還是整個退役）還沒決定，先兩條都留著。
// 這支函式本身刻意設計成沒有連線生命週期管理的副作用（見結尾說明），方便被這兩種觸發方式共用。
//
// 全市場批次預算——直接呼叫現有的 calculate* 函式（不透過 HTTP），逐一幫「目前實際查得到的
// 每一家公司」把指標算過一輪、upsert 進對應的 analysis 表。這是快取的預先填充，不是新的計算
// 邏輯——每支指標的公式/優雅降級規則完全沿用各自既有的實作，job 清單本身在 ./indicatorRegistry.ts。
//
// 兩種公司清單來源，動態查詢、不寫死清單或數量（見 2026-08-31 的盤點）：
// - mops 季度財報（quarterly_income_statement）2026-09-05 跟 mops-ts 對過：實際覆蓋 249 家公司
//   （回溯至 110Q3、23 季歷史），不是早期文件裡誤傳的「27 家」——那個 27 其實是「44 支指標裡有
//   27 支依賴三表 export view」這個指標依賴數，跟公司覆蓋數是兩件事，之前被混在一起講。
//   `profitability`/`cashFlow`/`resilience`/`turnover`/`guru`/`valuation` 的 psr/pFcf/evEbitda
//   這批指標受限於三表目前實際涵蓋的公司範圍，不是這支腳本能解決的，mops-ts ingest 更多公司
//   財報後這裡會自動涵蓋，不用改程式碼。
// - twse `daily_price`／twse+tpex `daily_valuation` 涵蓋 1,000+ 家，`portfolio/beta`、
//   `valuation/marketRatios` 走這條路線（`technicals` 8 支指標曾經也走這條路線，2026-09-06
//   已隨功能刪除連同表一起清掉）。
// 2026-09-17 Phase 4：從 http/batch/runner.ts 搬到 application，logger 與完整性檢查的查詢改由 deps 注入。

import type { AppDeps } from '@/application/deps';
import type { LoggerPort } from '@/application/ports/logger';
import type { IndicatorJob } from './indicatorJob';
import { checkJobCompleteness } from './completenessCheck';

export type BatchRunnerDeps = Pick<AppDeps, 'logger' | 'metricValueQueries'>;

// 小併發，對齊現有 Prisma client 的 connection_limit=5 池大小設定，不要一次打爆連線池。
const CONCURRENCY = 5;

const runWithConcurrency = async (companyIds: string[], run: (id: string) => Promise<unknown>, logger: LoggerPort): Promise<{ success: number; failed: string[] }> => {
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
        logger.error({ err: error }, `  ✖ ${id}:`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companyIds.length) }, worker));
  return { success, failed };
};

// 2026-09-04：這裡刻意不斷開任何 Prisma client 連線——一開始（只有 CLI 腳本會呼叫這支
// 函式時）結尾有斷線，那時候是對的，因為 CLI 腳本跑完就要讓 process 結束。現在
// http/batch/route.ts 也會在跟 bff 端點共用的同一個長駐伺服器行程裡呼叫這支函式，
// 斷線會把其他端點也在用的共用連線一起斷掉。「跑完要不要斷線」交給呼叫端自己決定
// （CLI 腳本結尾斷、HTTP route 結尾不斷），不是這支函式該管的事。
// 2026-09-05 起接受 jobs 參數，不再寫死跑 indicatorRegistry.ts 的全部 indicatorJobs——
// 拆成 daily/quarterly 兩組批次頻率之後（見 route.ts），呼叫端決定要跑哪一組；
// scripts/batchComputeIndicators.ts（CLI 手動觸發）維持「一次跑全部」，自己把
// indicatorJobs（合併後的完整清單）傳進來。
export const runBatchCompute = async (jobs: IndicatorJob[], deps: BatchRunnerDeps): Promise<void> => {
  for (const job of jobs) {
    const companyIds = await job.getCompanyIds();
    deps.logger.info({}, `[${job.name}] 開始，共 ${companyIds.length} 家公司`);
    const batchStartedAt = new Date();
    const { success, failed } = await runWithConcurrency(companyIds, job.run, deps.logger);
    deps.logger.info({}, `[${job.name}] 完成：成功 ${success}，失敗 ${failed.length}${failed.length > 0 ? `（${failed.join(', ')}）` : ''}`);

    // 完整性檢查：success/failed 只反映 job.run() 有沒有 throw，calculate* 函式內部的
    // upsert 失敗會被自己吞掉不重新 throw（見 completenessCheck.ts 開頭說明），這裡從外部
    // 獨立驗證這次時間窗內實際被寫入/更新的列數，不影響批次本身的行為。
    const completeness = await checkJobCompleteness(job, companyIds, batchStartedAt, deps);
    if (completeness.skipped) {
      deps.logger.warn({ metricKey: completeness.metricKey, reason: completeness.skipped }, `[${job.name}] 完整性檢查已跳過`);
    } else {
      deps.logger.info(
        { metricKey: completeness.metricKey, attempted: completeness.attempted, written: completeness.written, coverageRatio: completeness.coverageRatio },
        `[${job.name}] 完整性：攻打 ${completeness.attempted} 家，本次時間窗內實際寫入/更新 ${completeness.written} 家（覆蓋率 ${(completeness.coverageRatio * 100).toFixed(1)}%）`
      );
    }
  }
};
