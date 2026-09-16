import { runBatchCompute } from '@/application/batch/runner';
import { indicatorJobs } from '@/application/batch/indicatorRegistry';
import { appDeps } from './deps';

// CLI 手動觸發（scripts/batchComputeIndicators.ts）的綁定入口：一次跑全部 indicatorJobs（不分 daily/quarterly），
// deps 用跟伺服器同一份 appDeps。跟 http/batch 的兩支端點呼叫的是同一支 runBatchCompute。
export const runAllIndicatorJobs = (): Promise<void> => runBatchCompute(indicatorJobs, appDeps);
