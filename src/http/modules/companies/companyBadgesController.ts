import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { evaluateCompanyBadges } from '@/application/metrics/shared/badges/evaluateCompanyBadges';

export const getCompanyBadgesQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
});

// 2026-09-13 使用者要求：前端原本拿 GET /metrics 的 badge.threshold 自己跟 metric-history
// 的數值土法煉鋼比較「達成/未達成」，已證實會出錯（不同性質的指標混在同一組計數、沒處理
// 產業排除等 null 情境，見 obsidian-8d 那邊回報的落差）。這支端點統一由後端算好每支 badge
// 的 passed，前端只管呈現，範圍限定在 15 支「有 badge」的指標（見 evaluateCompanyBadges.ts
// 的完整說明），依 GET /metrics 既有的 categoryKey 分組。財務韌性三模型的正式聚合計數
// （zone/calibrationStatus）還在跟文件維護方對落差，這支端點目前只做每支 badge 各自獨立
// 判定，不含三模型聚合，等規格定案後再擴充。
export const getCompanyBadges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyBadgesQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol } = validationResult.data;
    const categories = await evaluateCompanyBadges(symbol);
    res.status(200).json({ symbol, categories });
  } catch (error) {
    next(error);
  }
};
