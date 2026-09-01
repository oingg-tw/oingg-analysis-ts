import { z } from 'zod';
import type { CompanyRouteRequest, CompanyRouteResponse } from '@/shared/registerCompanyRoute';
import { calculateBeta } from './service';

const querySchema = z.object({
  companyId: z.string({ required_error: 'companyId is required.' }).min(1),
  // 選填，格式 YYYY-MM-DD；不給就抓「股價跟指數都有資料的最新一個重疊交易日」。
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'asOfDate must be in YYYY-MM-DD format.')
    .optional(),
});

export const getBeta = async (req: CompanyRouteRequest, res: CompanyRouteResponse) => {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
      return undefined;
    }

    return calculateBeta(validationResult.data);
};
