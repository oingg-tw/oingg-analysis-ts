import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { calculateForeignHoldingRanking } from './service';

// max 20——2026-09-01 實測 foreign_holding 目前只鏡像 20 檔公司（twse-ts 匯出範圍尚未鋪滿全市場），
// 母數這麼小時上限先跟著收緊；等鏡像鋪滿全市場後可以再放寬（比照 marginShortRatioRanking 的 max 100）。
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const getForeignHoldingRanking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const result = await calculateForeignHoldingRanking(validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Foreign holding ranking calculation failed:', error);
    next(error);
  }
};
