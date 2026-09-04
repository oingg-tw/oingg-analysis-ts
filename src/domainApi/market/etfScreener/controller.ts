import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { runEtfScreener, getEtfFilterCatalog, EtfScreenerValidationError } from './service';

// 數字/類別兩種 filter 形狀用 z.union 分辨——數字要有 min/max（可以是 null），類別要有
// values 陣列，兩者都缺或都給的畸形請求會被 union 擋在 zod 這層（400），不會進到 service.ts。
const numericFilterSchema = z.object({
  field: z.string().min(1),
  min: z.number().nullable(),
  max: z.number().nullable(),
  exclude: z.boolean().optional(),
});
const categoricalFilterSchema = z.object({
  field: z.string().min(1),
  values: z.array(z.string()),
});
const filterSchema = z.union([numericFilterSchema, categoricalFilterSchema]);

const columnSchema = z.object({ field: z.string().min(1) });

export const postEtfScreenerBodySchema = z.object({
  filters: z.array(filterSchema).default([]).meta({ description: '數字欄位用 {field, min, max, exclude?}；類別欄位用 {field, values: [...]}（IN 語意）' }),
  columns: z.array(columnSchema).default([]),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortField: z.string().min(1).optional().meta({ description: '不給就照 symbol 排序；要排別的欄位，那個欄位要先出現在 columns 裡' }),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
const bodySchema = postEtfScreenerBodySchema;

export const postEtfScreener = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = bodySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid request body.', errors: validationResult.error.format() });
    }
    const result = await runEtfScreener(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof EtfScreenerValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('ETF screener query failed:', error);
    next(error);
  }
};

export const getEtfScreenerFilters = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getEtfFilterCatalog();
    res.status(200).json(result);
  } catch (error) {
    console.error('ETF screener filter catalog lookup failed:', error);
    next(error);
  }
};
