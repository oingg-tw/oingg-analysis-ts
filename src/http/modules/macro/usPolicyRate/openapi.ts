import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { usPolicyRateResultSchema } from '@/application/macro/usPolicyRate/types';
import { usPolicyRateQuerySchema } from './schemas';

export const registerUsPolicyRateOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/macro/us-policy-rate',
    summary: '美國聯邦基金利率目標歷次調整事件（目標區間上下限）',
    description:
      '事件型序列：一列就是一次調整的生效日，不是逐日快照，形狀跟 /macro/cbc-policy-rate 對稱，可以疊在大盤或個股走勢上當事件標記。' +
      '資料來源是 gov-ts 的 export.us_policy_rate（Federal Reserve 經 FRED：1982–2008 單一目標值 DFEDTAR、2008-12-16 起目標區間 DFEDTARU／DFEDTARL），本服務只讀；' +
      '2008-12-16 以前的單一目標值上下限同值，所以同一套欄位跨得過那條制度斷點。本服務唯一的加工是 changeBp（上限相對前一次的變動，基點）。' +
      '這是政策利率，不是公債殖利率，不能直接當無風險利率。某一天的利率水準 = 生效日 <= 該日的最後一筆（階梯函數）。',
    tags: ['Macro'],
    request: { query: usPolicyRateQuerySchema },
    responses: {
      200: { description: '依生效日由舊到新排序的調整事件，查無資料時 entries 是空陣列。', content: { 'application/json': { schema: usPolicyRateResultSchema } } },
    },
  });
};
