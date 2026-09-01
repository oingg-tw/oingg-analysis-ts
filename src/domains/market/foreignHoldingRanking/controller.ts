import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateForeignHoldingRanking } from './service';

const querySchema = z.object({
  topPercent: z.coerce.number().min(1).max(50).default(10),
});

export const getForeignHoldingRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await calculateForeignHoldingRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Foreign holding ranking calculation failed:', error);
    next(error);
  }
};
