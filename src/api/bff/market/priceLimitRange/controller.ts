import { type Request, type Response, type NextFunction } from 'express';
import { getPriceLimitRange } from './service';
import { logger } from '@/shared/logger';

export const getPriceLimitRangeRanking = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getPriceLimitRange();
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Price limit range lookup failed:');
    next(error);
  }
};
