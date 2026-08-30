import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateAtr } from './service';

const querySchema = z.object({
  companyId: z.string({ required_error: 'companyId is required.' }).min(1),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'asOfDate must be in YYYY-MM-DD format.').optional(),
});

export const getAtr = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
    }

    const result = await calculateAtr(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('ATR calculation failed:', error);
    next(error);
  }
};
