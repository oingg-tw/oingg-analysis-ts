import { z } from 'zod';

// 上限/預設值比照 stocks/daily-price-history 的既有慣例（見 stocks/schemas.ts 的
// MAX_DAILY_PRICE_HISTORY_LIMIT 註解），大盤指數跟個股股價同樣是逐日資料，沒有理由
// 另外設計一套規則。
const MAX_TAIEX_DAILY_PRICE_LIMIT = 2000;
export const getTaiexDailyPriceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_TAIEX_DAILY_PRICE_LIMIT).default(250).meta({ description: `取最近幾個交易日，預設 250（約 1 年），上限 ${MAX_TAIEX_DAILY_PRICE_LIMIT}。` }),
});
