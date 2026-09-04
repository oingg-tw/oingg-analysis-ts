import { type Request, type Response, type NextFunction } from 'express';
import { getVolumeTop20 } from './service';
import { logger } from '@/shared/logger';

export const getVolumeTop20Ranking = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getVolumeTop20();
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Volume top 20 lookup failed:');
    next(error);
  }
};
