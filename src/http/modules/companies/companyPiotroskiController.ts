import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { z } from 'zod';
import { getPiotroskiFScoreBreakdown } from '@/application/metrics/quality/piotroskiFScore/getPiotroskiFScoreBreakdown';
import { legacyPitDeps } from '@/application/metrics/legacyBridge';

export const getCompanyPiotroskiBreakdownQuerySchema = z
  .object({
    symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
    year: z
      .string()
      .regex(/^\d{2,3}$/, 'year 必須是民國年數字字串，例如 "115"。')
      .optional()
      .meta({ description: '民國年，例如 "115"；跟 season 要成對提供，不給就自動抓最新一季', example: '115' }),
    season: z.enum(['1', '2', '3', '4']).optional().meta({ description: '季別 1-4；跟 year 要成對提供' }),
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), {
    message: 'year 和 season 必須成對提供，只給其中一個是無效請求。',
    path: ['season'],
  });

// 2026-09-10 web-nuxt 要求：piotroskiFScore 只寫入最終 0-9 分（見
// computePiotroskiFScorePit.ts 的說明），9 個子訊號本身不是獨立可篩選的指標，故不走
// metric-history 那套、不新增 metric_code，另開這支端點現查現算，依 Piotroski (2000)
// 原始論文的分組回傳（獲利能力/財務槓桿與流動性/營運效率），分組內子分數留給前端自己算
// （只是瑣碎算術）。查無資料（found: false）是正常情境，不是 404，跟 financial-statement/
// roe-history 同一種慣例。
export const getCompanyPiotroskiBreakdown = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyPiotroskiBreakdownQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, year, season } = validationResult.data;
    // Phase 3 遷移期間先綁 legacyPitDeps；Phase 4 改收 bootstrap 綁定好的 use case。
    const breakdown = await getPiotroskiFScoreBreakdown({ symbol, year, season, dataType: '2', subsidiaryCompanyId: '' }, legacyPitDeps);
    res.status(200).json(breakdown);
  } catch (error) {
    next(error);
  }
};
