import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateMarginShortRatioRanking } from './service';
import { logger } from '@/shared/logger';

export const getMarginShortRatioRankingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).meta({ description: '預設 20，上限 100。' }),
});
const querySchema = getMarginShortRatioRankingQuerySchema;

export const getMarginShortRatioRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await calculateMarginShortRatioRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Margin short ratio ranking calculation failed:');
    next(error);
  }
};
