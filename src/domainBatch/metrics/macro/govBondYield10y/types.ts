import { z } from 'zod';
import { metricStatusSchema } from '@/shared/metricStatus';

export const govBondYield10yResultSchema = z.object({
  yieldPct: z.number().nullable().meta({ description: '百分比，例如 1.9 代表 1.9%' }),
  asOfMonth: z.string().nullable().meta({ description: '"YYYY-MM"，查無資料時是 null' }),
  fieldStatuses: z.record(z.string(), metricStatusSchema),
  warnings: z.array(z.string()),
});
export type GovBondYield10yResult = z.infer<typeof govBondYield10yResultSchema>;
