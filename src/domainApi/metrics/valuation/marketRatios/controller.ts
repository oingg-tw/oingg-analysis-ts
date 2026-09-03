import { z } from 'zod';
import type { CompanyRouteRequest, CompanyRouteResponse } from '@/shared/registerCompanyRoute';
import { calculateMarketRatios } from '@/domainBatch/metrics/valuation/marketRatios/service';

const querySchema = z.object({
  companyId: z.string({ error: 'companyId is required.' }).min(1),
  // 選填，格式 YYYY-MM-DD；不給就抓最新一筆。跟其他指標的 year/season 是完全不同的查詢介面，
  // 因為 PER/PBR 是逐日市場資料，不是季度資料。
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.')
    .optional(),
});

export const getMarketRatios = async (req: CompanyRouteRequest, res: CompanyRouteResponse) => {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
      return undefined;
    }

    return calculateMarketRatios(validationResult.data);
};
