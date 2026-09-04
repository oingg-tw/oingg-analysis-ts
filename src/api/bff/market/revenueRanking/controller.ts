import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateRevenueRanking } from './service';
import { logger } from '@/shared/logger';

export const getRevenueRankingQuerySchema = z.object({
  metric: z.enum(['yoy', 'mom', 'revenue'], { error: 'metric is required.' }),
  order: z.enum(['asc', 'desc'], { error: 'order is required.' }),
  limit: z.coerce.number().int().min(1).max(50).default(20).meta({ description: '預設 20，上限 50。' }),
});
const querySchema = getRevenueRankingQuerySchema;

export const getRevenueRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await calculateRevenueRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Revenue ranking calculation failed:');
    next(error);
  }
};
