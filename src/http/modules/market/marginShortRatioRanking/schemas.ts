import { z } from 'zod';

export const getMarginShortRatioRankingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).meta({ description: '預設 20，上限 100。' }),
});
