import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateRanking } from '@/domainMetrics/ranking';
import { logger } from '@/shared/logger';

export const getRankingQuerySchema = z.object({
  metric: z.enum(['peRatio', 'pbRatio', 'dividendYield'], { error: 'metric is required.' }).meta({ description: '要排行的欄位' }),
  order: z.enum(['asc', 'desc'], { error: 'order is required.' }).meta({ description: '排序方向，沒有預設值，必須自己指定' }),
  limit: z.coerce.number().int().min(1).max(100).default(20).meta({ description: '回傳筆數，預設 20，最多 100' }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.')
    .optional()
    .meta({ description: '交易日，選填（不給就抓最新一個交易日）', example: '2026-08-28' }),
});
const querySchema = getRankingQuerySchema;

export const getRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
    }

    const result = await calculateRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Ranking calculation failed:');
    next(error);
  }
};
