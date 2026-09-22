import { z } from 'zod';

// 上限/預設值比照 stocks/daily-price-history 的既有慣例（見 stocks/schemas.ts 的
// MAX_DAILY_PRICE_HISTORY_LIMIT 註解），大盤指數跟個股股價同樣是逐日資料，沒有理由
// 另外設計一套規則。
// 2026-09-22 從 2000 放寬到 8000：web-nuxt /macro/market-phases 要用日收盤算急跌段（月平均會把單月內急跌急彈削掉一半），
// 1999 至今約 6,800 個交易日一次抓完存 24h 快取，不會反覆打；一列只有 tradeDate+close，8,000 列約 300KB。
const MAX_TAIEX_DAILY_PRICE_LIMIT = 8000;
export const getTaiexDailyPriceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_TAIEX_DAILY_PRICE_LIMIT).default(250).meta({ description: `取最近幾筆，預設 250（daily 約 1 年），上限 ${MAX_TAIEX_DAILY_PRICE_LIMIT}。` }),
  interval: z
    .enum(['daily', 'weekly', 'monthly'])
    .default('daily')
    .meta({ description: '粒度：daily 逐日；weekly/monthly 每週（週一起算）/每月取最後一個交易日的收盤，tradeDate 仍是實際交易日。資料 1999-01 起，monthly 全歷史約 330 筆、weekly 約 1,400 筆，都在上限內。' }),
});
