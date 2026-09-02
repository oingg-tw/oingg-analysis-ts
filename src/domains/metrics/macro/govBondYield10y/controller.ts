import { type Request, type Response, type NextFunction } from 'express';
import { getLatestGovBondYield10y } from './service';

export const getGovBondYield10y = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getLatestGovBondYield10y();
    res.status(200).json(result);
  } catch (error) {
    console.error('Gov bond yield 10y lookup failed:', error);
    next(error);
  }
};
