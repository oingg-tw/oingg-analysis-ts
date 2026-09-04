import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';

const responseSchema = z.object({ message: z.string() });

export const registerQuarterlyBatchOpenApi = (): void => {
  registry.registerPath({
    method: 'post',
    path: '/batch/compute/quarterly',
    summary: '觸發季度批次預算（34 支依賴財報的指標 x 全部公司），給 GCP Cloud Scheduler 用',
    description:
      '涵蓋 profitability（11 支）、cashFlow（4 支）、solvency（5 支）、turnover（2 支）、guru（9 支）、' +
      'valuation 的 psr/pFcf/evEbitda（3 支）——這些都依賴 mops 季度財報，一家公司一季頂多變一次，跟 daily ' +
      '那組（依賴每日股價/市場行情）刻意分開，避免每天對財報資料白算一次。' +
      '跟 domainApi 的各支指標端點共用同一份計算邏輯（見 src/domainMetrics/），差別是這支端點一次跑全市場每家公司，' +
      '不是單一公司查詢。實際邏輯在 src/domainBatch/runner.ts 的 runBatchCompute，跑完才回應（同步），視資料量可能要好幾分鐘，' +
      '呼叫方逾時設定要抓夠長。目前沒有身份驗證——正式環境部署前要靠 Cloud Run IAM invoker 權限（只允許指定的 Scheduler ' +
      '服務帳號呼叫）擋住，不能公開曝露。已加上每小時 5 次的 rate limit 當臨時防護（超過回 429），不是驗證機制的替代品。',
    tags: ['System'],
    responses: {
      200: { description: 'quarterly 批次計算完成。', content: { 'application/json': { schema: responseSchema } } },
      429: { description: '超過每小時 5 次的觸發上限（暫時性防護，不是驗證失敗）。' },
      500: {
        description:
          '批次計算過程中發生未預期錯誤（單一公司/單一指標失敗會被 runWithConcurrency 接住繼續跑下一個，不會走到這裡；' +
          '這裡是連線建立不起來等更根本的失敗）。',
      },
    },
  });
};
