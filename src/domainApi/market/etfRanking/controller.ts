import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateEtfRanking } from './service';
import { logger } from '@/shared/logger';

export const getEtfRankingQuerySchema = z.object({
  metric: z.enum(
    ['aum', 'holders', 'netFlow', 'dcaAmount', 'return3m', 'return6m', 'return1y', 'return2y', 'return3y', 'return5y', 'returnYtd', 'return10y', 'expenseRatio'],
    { error: 'metric is required.' }
  ),
  order: z.enum(['asc', 'desc'], { error: 'order is required.' }),
  limit: z.coerce.number().int().min(1).max(50).default(20).meta({ description: '預設 20，上限 50。' }),
});
const querySchema = getEtfRankingQuerySchema;

export const getEtfRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await calculateEtfRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'ETF ranking calculation failed:');
    next(error);
  }
};
