import { z } from 'zod';

export const getAttentionStocksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20).meta({ description: '預設 20，上限 50。' }),
});
