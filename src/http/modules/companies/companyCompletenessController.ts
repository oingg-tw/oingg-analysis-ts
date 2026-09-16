import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { z } from 'zod';
import { evaluateCompanyMetricCompleteness } from '@/application/metrics/shared/completeness/evaluateCompanyMetricCompleteness';

export const getCompanyMetricCompletenessQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
});

// 2026-09-13 使用者要求：有沒有機制掃描每間公司的指標完整度——GET /companies/badges
// 只涵蓋 15 支「有 badge」的指標，這支端點掃過 GET /metrics 全部指標，各自查一筆代表性
// timeframe 的最新值，回傳 hasValue/nullReason，見 evaluateCompanyMetricCompleteness.ts
// 的完整說明（代表性 timeframe 優先取 TTM，其次取第一個可用 timeframe，不是掃全部 timeframe 組合）。
// 用途是資料品質稽核/前端「這家公司資料涵蓋度」呈現，不是「達成/未達成」判定（沒有門檻
// 概念），這點跟 badges 端點刻意不同。
export const getCompanyMetricCompleteness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricCompletenessQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol } = validationResult.data;
    const categories = await evaluateCompanyMetricCompleteness(symbol);
    const coveredCount = categories.reduce((sum, category) => sum + category.coveredCount, 0);
    const totalCount = categories.reduce((sum, category) => sum + category.totalCount, 0);
    res.status(200).json({ symbol, coveredCount, totalCount, categories });
  } catch (error) {
    next(error);
  }
};
