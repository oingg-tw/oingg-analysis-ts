import { z } from 'zod';
import { registry } from '@/infrastructure/swagger/registry';

const responseSchema = z.object({ message: z.string() });

export const registerQuarterlyBatchOpenApi = (): void => {
  registry.registerPath({
    method: 'post',
    path: '/batch/compute/quarterly',
    summary: '觸發季度批次預算（依賴財報的舊架構指標 x 全部公司），給 GCP Cloud Scheduler 用',
    description:
      '2026-09-07：原本登記在這裡的 34 支舊架構指標（profitability/cashFlow/resilience/turnover/guru/valuation ' +
      '六個分類）已經全部有 pitMetrics 版本可查（見 GET /companies/metric-history），使用者要求把舊架構' +
      '（domainMetrics/*.ts + 各自一張 Result 表）整批 DROP，quarterlyIndicatorJobs 目前是空陣列——' +
      '這支端點呼叫了不會出錯，只是空跑，之後如果要新增新的季度型批次指標可以直接復用這個殼。' +
      '這些指標本來的共同特徵是依賴 mops 季度財報，一家公司一季頂多變一次，跟 daily 那組（依賴每日股價/市場行情，' +
      '目前還在跑的 marketRatios/beta）刻意分開，避免每天對財報資料白算一次。' +
      '實際邏輯在 src/api/batch/runner.ts 的 runBatchCompute，跑完才回應（同步），視資料量可能要好幾分鐘，' +
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
