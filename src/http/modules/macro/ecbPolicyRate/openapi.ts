import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { ecbPolicyRateResultSchema } from '@/application/macro/ecbPolicyRate/types';
import { ecbPolicyRateQuerySchema } from './schemas';

export const registerEcbPolicyRateOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/macro/ecb-policy-rate',
    summary: '歐洲央行三大政策利率歷次調整事件（存款機制／主要再融資／邊際貸款）',
    description:
      '事件型序列：一列就是一次調整的生效日，不是逐日快照，形狀跟 /macro/us-policy-rate、/macro/cbc-policy-rate 對稱，可以疊在走勢上當事件標記。' +
      '資料來源是 gov-ts 的 export.ecb_policy_rate（ECB Data Portal），本服務只讀；本服務唯一的加工是三支利率各自相對前一次的變動（基點）。' +
      '三支利率不一定同步調整（有些次只動利率走廊），所以三個幅度分開給，不挑代表利率。' +
      '這是政策利率，不是公債殖利率。某一天的利率水準 = 生效日 <= 該日的最後一筆（階梯函數）。',
    tags: ['Macro'],
    request: { query: ecbPolicyRateQuerySchema },
    responses: {
      200: { description: '依生效日由舊到新排序的調整事件，查無資料時 entries 是空陣列。', content: { 'application/json': { schema: ecbPolicyRateResultSchema } } },
    },
  });
};
