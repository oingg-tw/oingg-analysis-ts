import { registry } from '@/infrastructure/swagger/registry';
import { getTaiexDailyPriceQuerySchema } from './controller';
import { taiexDailyPriceResultSchema } from './types';

export const registerTaiexDailyPriceOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/taiex-daily-price',
    summary: '大盤加權股價指數（TAIEX）逐日收盤序列',
    description:
      '直接查詢 export.daily_taiex_index（跟 beta 這支 metricCode 算 Beta 係數用的同一張表），不做任何額外加工，' +
      '只有 tradeDate+close（沒有 OHLV，大盤指數沒有適用場景），依交易日由舊到新排序，跟 GET /stocks/{symbol}/daily-price-history 同一種慣例，' +
      '方便前端把「個股股價 vs 大盤」疊圖比較（例如視覺化 Beta 卡片背後在算的東西）。',
    tags: ['Market'],
    request: { query: getTaiexDailyPriceQuerySchema },
    responses: {
      200: { description: '依交易日由舊到新排序的大盤逐日收盤價，查無資料時 entries 是空陣列。', content: { 'application/json': { schema: taiexDailyPriceResultSchema } } },
    },
  });
};
