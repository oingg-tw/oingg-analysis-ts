import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculatePriceChangeRanking } from './service';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const getPriceChangeRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await calculatePriceChangeRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Price change ranking calculation failed:', error);
    next(error);
  }
};
