import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateRanking } from './service';

const querySchema = z.object({
  metric: z.enum(['peRatio', 'pbRatio', 'dividendYield'], { error: 'metric is required.' }),
  order: z.enum(['asc', 'desc'], { error: 'order is required.' }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.').optional(),
});

export const getRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
    }

    const result = await calculateRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Ranking calculation failed:', error);
    next(error);
  }
};
