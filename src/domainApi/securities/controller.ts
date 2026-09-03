import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { listSecuritySymbols } from './service';

// z.coerce.boolean() 是個陷阱——底層用 JS 的 Boolean(value)，query string 只要非空字串
// （包含字面上的 "false"）一律轉成 true。用字串本身判斷才對，跟 src/domainApi/companies/controller.ts
// 同樣的處理方式。
const booleanQueryParam = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === 'true'));

const querySchema = z.object({
  market: z.enum(['TWSE', 'TPEx']).optional(),
  includeEmerging: booleanQueryParam(true),
  excludeKy: booleanQueryParam(false),
  preferredStock: z.enum(['only', 'exclude']).optional(),
  excludeFullDelivery: booleanQueryParam(false),
});

export const getSecuritySymbolsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const result = await listSecuritySymbols(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
