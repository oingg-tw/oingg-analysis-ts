import { z } from 'zod';

export const ecbPolicyRateQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .meta({ description: '只回傳生效日 >= 這天（"YYYY-MM-DD"）的事件；不給就回全部歷史（1999-01-01 起，約七十筆，不需要分頁）。' }),
});
