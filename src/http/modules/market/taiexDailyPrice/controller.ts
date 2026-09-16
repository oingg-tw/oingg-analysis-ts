import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getTaiexDailyPrice } from './service';
import { logger } from '@/infrastructure/logger';

// 上限/預設值比照 stocks/daily-price-history 的既有慣例（見 controller.ts 的
// MAX_DAILY_PRICE_HISTORY_LIMIT 註解），大盤指數跟個股股價同樣是逐日資料，沒有理由
// 另外設計一套規則。
const MAX_TAIEX_DAILY_PRICE_LIMIT = 2000;
export const getTaiexDailyPriceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_TAIEX_DAILY_PRICE_LIMIT).default(250).meta({ description: `取最近幾個交易日，預設 250（約 1 年），上限 ${MAX_TAIEX_DAILY_PRICE_LIMIT}。` }),
});

export const getTaiexDailyPriceHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queryResult = getTaiexDailyPriceQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: queryResult.error.format() });
    }

    const result = await getTaiexDailyPrice(queryResult.data.limit);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'TAIEX daily price lookup failed:');
    next(error);
  }
};
