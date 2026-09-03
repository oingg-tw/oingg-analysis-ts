import { type Request, type Response, type NextFunction } from 'express';
import { getVolumeTop20 } from './service';

export const getVolumeTop20Ranking = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getVolumeTop20();
    res.status(200).json(result);
  } catch (error) {
    console.error('Volume top 20 lookup failed:', error);
    next(error);
  }
};
