import { z } from 'zod';

export const getRevenueRankingQuerySchema = z.object({
  metric: z.enum(['yoy'], { error: 'metric is required.' }),
  order: z.enum(['asc', 'desc'], { error: 'order is required.' }),
  limit: z.coerce.number().int().min(1).max(50).default(20).meta({ description: '預設 20，上限 50。' }),
});
