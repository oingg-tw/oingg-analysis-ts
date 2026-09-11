import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { listAllSecurityNames, countAllSecurityNames } from '@/shared/sourceData/companyProfile';

// 2026-09-11 應 web-nuxt 要求新增——「公司」（GET /companies，company_profile 完整登記
// 範疇）跟「證券」（真正能交易的標的，含特別股）是刻意分開的兩個概念，不共用同一支端點，
// 見 companyProfile.ts 的 listAllSecurityNames 說明。上限/預設值跟 GET /companies 一致。
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

export const getSecuritiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).meta({ description: `這次要拿幾筆，預設 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}。` }),
  offset: z.coerce.number().int().min(0).default(0).meta({ description: '跳過前面幾筆，預設 0。' }),
  countOnly: z.string().optional().meta({ description: 'true 時只回總筆數（`{ count }`），不拉實際資料。' }),
});

const parsedGetSecuritiesQuerySchema = getSecuritiesQuerySchema.extend({
  countOnly: getSecuritiesQuerySchema.shape.countOnly.transform((value) => value === 'true'),
});

export const getSecurities = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = parsedGetSecuritiesQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const { limit, offset, countOnly } = validationResult.data;

    if (countOnly) {
      const count = await countAllSecurityNames();
      return res.status(200).json({ count });
    }

    const { count, entries } = await listAllSecurityNames(limit, offset);
    res.status(200).json({ count, limit, offset, entries });
  } catch (error) {
    next(error);
  }
};
