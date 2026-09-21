import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { cbcPolicyRateResultSchema } from '@/application/macro/cbcPolicyRate/types';
import { cbcPolicyRateQuerySchema } from './schemas';

export const registerCbcPolicyRateOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/macro/cbc-policy-rate',
    summary: '央行政策利率歷次調整事件（重貼現率／擔保放款融通利率／短期融通利率）',
    description:
      '事件型序列：一列就是一次利率調整的生效日，不是逐日/逐月快照，直接當圖上的事件標記用（例如疊在 /market/taiex-daily-price 或個股 daily-price-history 上）。' +
      '資料來源是 gov-ts 的 export.cbc_policy_rate（央行統計資料庫 EG28D01en，1989-04-01 起，本服務只讀），本服務唯一的加工是 changeBp（重貼現率相對前一次的變動，基點）。' +
      '某一天的利率水準 = 生效日 <= 該日的最後一筆（階梯函數）。只有生效日、沒有理監事會決議日。',
    tags: ['Macro'],
    request: { query: cbcPolicyRateQuerySchema },
    responses: {
      200: { description: '依生效日由舊到新排序的調整事件，查無資料時 entries 是空陣列。', content: { 'application/json': { schema: cbcPolicyRateResultSchema } } },
    },
  });
};
