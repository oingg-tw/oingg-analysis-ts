import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { getTaiexDailyPriceQuerySchema } from './schemas';
import { taiexDailyPriceResultSchema } from '@/application/market/taiexDailyPrice/types';

export const registerTaiexDailyPriceOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/taiex-daily-price',
    summary: '大盤加權股價指數（TAIEX）收盤序列（逐日／每週／每月）',
    description:
      '直接查詢 export.daily_taiex_index（跟 beta 這支 metricCode 算 Beta 係數用的同一張表），不做任何額外加工，' +
      '只有 tradeDate+close（沒有 OHLV，大盤指數沒有適用場景），依交易日由舊到新排序，跟 GET /stocks/{symbol}/daily-price-history 同一種慣例，' +
      '方便前端把「個股股價 vs 大盤」疊圖比較（例如視覺化 Beta 卡片背後在算的東西）。interval=weekly|monthly 取每區間最後一個交易日，' +
      '給 25 年尺度的圖（例如疊 /macro/cbc-policy-rate 的升降息事件）用。limit 上限 8000（2026-09-22 從 2000 放寬），daily 一次可取回 1999 起整段約 6,800 個交易日。',
    tags: ['Market'],
    request: { query: getTaiexDailyPriceQuerySchema },
    responses: {
      200: { description: '依交易日由舊到新排序的大盤逐日收盤價，查無資料時 entries 是空陣列。', content: { 'application/json': { schema: taiexDailyPriceResultSchema } } },
    },
  });
};
