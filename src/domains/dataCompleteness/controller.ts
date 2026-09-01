import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateDataCompleteness } from './service';

const querySchema = z.object({
  companyId: z.string({ required_error: 'companyId is required.' }).min(1),
});

export const getDataCompleteness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
    }

    const result = await calculateDataCompleteness(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Data completeness calculation failed:', error);
    next(error);
  }
};
