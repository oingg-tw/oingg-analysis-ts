import { type Request, type Response, type NextFunction } from 'express';
import { getLatestGovBondYield10y } from '@/domainMacro/govBondYield10y/service';
import { logger } from '@/shared/logger';

export const getGovBondYield10y = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getLatestGovBondYield10y();
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Gov bond yield 10y lookup failed:');
    next(error);
  }
};
