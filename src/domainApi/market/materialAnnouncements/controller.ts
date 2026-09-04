import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { listMaterialAnnouncements } from './service';
import { logger } from '@/shared/logger';

export const getMaterialAnnouncementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20).meta({ description: '預設 20，上限 50。' }),
});
const querySchema = getMaterialAnnouncementsQuerySchema;

export const getMaterialAnnouncements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await listMaterialAnnouncements(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Material announcements lookup failed:');
    next(error);
  }
};
