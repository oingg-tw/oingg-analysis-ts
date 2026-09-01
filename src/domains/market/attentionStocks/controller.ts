import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { listAttentionStocks } from './service';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const getAttentionStocks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await listAttentionStocks(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Attention stocks lookup failed:', error);
    next(error);
  }
};
