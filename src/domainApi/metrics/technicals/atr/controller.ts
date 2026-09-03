import { z } from 'zod';
import type { CompanyRouteRequest, CompanyRouteResponse } from '@/shared/registerCompanyRoute';
import { calculateAtr } from '@/domainBatch/metrics/technicals/atr/service';

const querySchema = z.object({
  companyId: z.string({ error: 'companyId is required.' }).min(1),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'asOfDate must be in YYYY-MM-DD format.').optional(),
});

export const getAtr = async (req: CompanyRouteRequest, res: CompanyRouteResponse) => {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
      return undefined;
    }

    return calculateAtr(validationResult.data);
};
