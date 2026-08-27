import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateBeneishMScore } from './service';

const querySchema = z.object({
  companyId: z.string({ required_error: 'companyId is required.' }).min(1),
  year: z.string({ required_error: 'year is required.' }).min(1), // 民國年，例如 "115"
  season: z.enum(['1', '2', '3', '4'], { required_error: 'season is required.' }),
  dataType: z.enum(['1', '2']).default('2'), // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: z.string().optional().default(''),
});

export const getBeneishMScore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
    }

    const result = await calculateBeneishMScore(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Beneish M-Score calculation failed:', error);
    next(error);
  }
};
