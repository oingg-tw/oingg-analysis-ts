import { type Request, type Response, type NextFunction } from 'express';
import { getPriceLimitRange } from './service';

export const getPriceLimitRangeRanking = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getPriceLimitRange();
    res.status(200).json(result);
  } catch (error) {
    console.error('Price limit range lookup failed:', error);
    next(error);
  }
};
