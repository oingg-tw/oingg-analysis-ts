import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateEquityRiskPremium } from './service';

const querySchema = z
  .object({
    startYear: z.coerce.number().int().optional(),
    startMonth: z.coerce.number().int().min(1).max(12).optional(),
    endYear: z.coerce.number().int().optional(),
    endMonth: z.coerce.number().int().min(1).max(12).optional(),
  })
  .refine((v) => (v.startYear === undefined) === (v.startMonth === undefined), {
    message: 'startYear and startMonth must be provided together.',
  })
  .refine((v) => (v.endYear === undefined) === (v.endMonth === undefined), {
    message: 'endYear and endMonth must be provided together.',
  });

export const getEquityRiskPremium = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
    }

    const result = await calculateEquityRiskPremium(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Equity risk premium calculation failed:', error);
    next(error);
  }
};
