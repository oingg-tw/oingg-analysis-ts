import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { runScreener, runScreenerRanking, ScreenerValidationError } from './service';

const filterSchema = z.object({
  field: z.string().min(1),
  min: z.number().nullable(),
  max: z.number().nullable(),
  exclude: z.boolean().optional(),
});

const columnSchema = z.object({ field: z.string().min(1) });

const bodySchema = z.object({
  filters: z.array(filterSchema).default([]),
  columns: z.array(columnSchema).default([]),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const postScreener = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = bodySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }
    const result = await runScreener(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ScreenerValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Screener query failed:', error);
    next(error);
  }
};

const rankingQuerySchema = z.object({
  field: z.string({ required_error: 'field is required.' }).min(1),
  direction: z.enum(['asc', 'desc'], { required_error: 'direction is required.' }),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  columns: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : [])),
});

export const getScreenerRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = rankingQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await runScreenerRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ScreenerValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Screener ranking query failed:', error);
    next(error);
  }
};
