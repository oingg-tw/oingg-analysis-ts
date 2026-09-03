import { z } from 'zod';
import type { CompanyRouteRequest, CompanyRouteResponse } from '@/shared/registerCompanyRoute';
import { calculateEvEbitda } from '@/domainBatch/metrics/valuation/evEbitda/service';

const querySchema = z
  .object({
    companyId: z.string({ error: 'companyId is required.' }).min(1),
    // year/season 選填但要成對——不給就自動抓最新一季，只給其中一個視為無效請求（見下方 refine）。
    year: z.string().min(1).optional(), // 民國年，例如 "115"
    season: z.enum(['1', '2', '3', '4']).optional(),
    dataType: z.enum(['1', '2']).default('2'), // 1 = 個體, 2 = 合併
    subsidiaryCompanyId: z.string().optional().default(''),
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), {
    message: 'year 和 season 要嘛都給，要嘛都不給——只給其中一個視為無效請求。',
    path: ['year'],
  });

export const getEvEbitda = async (req: CompanyRouteRequest, res: CompanyRouteResponse) => {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({
        message: 'Invalid query parameters.',
        errors: validationResult.error.format(),
      });
      return undefined;
    }

    return calculateEvEbitda(validationResult.data);
};
