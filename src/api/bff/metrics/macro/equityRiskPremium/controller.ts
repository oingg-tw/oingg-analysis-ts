import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateEquityRiskPremium } from '@/domainMetrics/macro/equityRiskPremium/service';
import { logger } from '@/shared/logger';

export const getEquityRiskPremiumQuerySchema = z.object({
  startYear: z.coerce.number().int().optional().meta({ description: '選填，窗口起始年（西元），要跟 startMonth 一起給', example: 1999 }),
  startMonth: z.coerce.number().int().min(1).max(12).optional().meta({ description: '選填，窗口起始月，要跟 startYear 一起給', example: 1 }),
  endYear: z.coerce.number().int().optional().meta({ description: '選填，窗口結束年（西元），要跟 endMonth 一起給' }),
  endMonth: z.coerce.number().int().min(1).max(12).optional().meta({ description: '選填，窗口結束月，要跟 endYear 一起給' }),
});

const querySchema = getEquityRiskPremiumQuerySchema
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
    logger.error({ err: error }, 'Equity risk premium calculation failed:');
    next(error);
  }
};
