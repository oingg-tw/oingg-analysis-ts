import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { runScreener, runScreenerRanking, runScreenerValues, ScreenerValidationError } from './service';

const filterSchema = z.object({
  field: z.string().min(1),
  min: z.number().nullable(),
  max: z.number().nullable(),
  exclude: z.boolean().optional(),
});

const columnSchema = z.object({ field: z.string().min(1) });

export const postScreenerBodySchema = z.object({
  filters: z.array(filterSchema).default([]).meta({ description: '篩選條件之間是 AND，field 一定要能對到 GET /filters catalog 裡的 "metricKey.fieldKey"' }),
  columns: z.array(columnSchema).default([]).meta({ description: '只影響回應要不要帶這個欄位，缺資料時是 null 但公司仍在結果裡' }),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortField: z.string().min(1).optional().meta({ description: '"symbol" 或已列在 columns 裡的欄位，兩者要嘛都給要嘛都不給，沒給預設用 symbol 排序' }),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
const bodySchema = postScreenerBodySchema;

export const postScreener = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = bodySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }
    const result = await runScreener(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ScreenerValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Screener query failed:', error);
    next(error);
  }
};

export const getScreenerRankingQuerySchema = z.object({
  field: z.string({ error: 'field is required.' }).min(1).meta({ example: 'roe.roeQuarterlyPct' }),
  direction: z.enum(['asc', 'desc'], { error: 'direction is required.' }),
  limit: z.coerce.number().int().min(1).max(50).default(10).meta({ description: '預設 10，上限 50。' }),
  columns: z.string().optional().meta({ description: '逗號分隔的額外顯示欄位（"metricKey.fieldKey" 格式）。' }),
});

const rankingQuerySchema = getScreenerRankingQuerySchema.extend({
  columns: getScreenerRankingQuerySchema.shape.columns.transform((value) => (value ? value.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : [])),
});

export const getScreenerRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = rankingQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await runScreenerRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ScreenerValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Screener ranking query failed:', error);
    next(error);
  }
};

// bff-ts 說他們一次最多送一頁的量（≤200），這裡跟其他「明確列出清單」端點（GET /stocks/prices）
// 同一種上限慣例：超過直接 400，不會默默只處理前 200 筆。
const MAX_SYMBOLS = 200;

export const postScreenerValuesBodySchema = z.object({
  symbols: z
    .array(z.string().min(1))
    .min(1, 'symbols 至少要有一個公司代號。')
    .max(MAX_SYMBOLS, `symbols 一次最多 ${MAX_SYMBOLS} 檔，請分批查詢。`)
    .meta({ description: `明確列出的公司代號清單，不是篩選條件，一次最多 ${MAX_SYMBOLS} 檔。` }),
  columns: z.array(columnSchema).min(1, 'columns 至少要有一個欄位。'),
});
const valuesBodySchema = postScreenerValuesBodySchema;

export const postScreenerValues = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = valuesBodySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }
    const result = await runScreenerValues(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ScreenerValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Screener values lookup failed:', error);
    next(error);
  }
};
