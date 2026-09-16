import { z } from 'zod';

export const getEtfRankingQuerySchema = z.object({
  metric: z.enum(
    ['aum', 'holders', 'netFlow', 'dcaAmount', 'return3m', 'return6m', 'return1y', 'return2y', 'return3y', 'return5y', 'returnYtd', 'return10y', 'expenseRatio'],
    { error: 'metric is required.' }
  ),
  order: z.enum(['asc', 'desc'], { error: 'order is required.' }),
  limit: z.coerce.number().int().min(1).max(50).default(20).meta({ description: '預設 20，上限 50。' }),
});
