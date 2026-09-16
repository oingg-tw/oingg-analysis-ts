import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { z } from 'zod';
import { PILOT_PROVENANCE_METRIC_CODES } from '@/application/metrics/shared/provenance/provenanceTypes';
import { PROVENANCE_RESOLVERS } from '@/application/metrics/shared/provenance/provenanceResolvers';

export const getCompanyMetricProvenanceQuerySchema = z
  .object({
    metricCode: z.enum(PILOT_PROVENANCE_METRIC_CODES, { error: `metricCode is required, 目前僅支援 ${PILOT_PROVENANCE_METRIC_CODES.join('/')}。` }),
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

// 2026-09-10 web-nuxt 要求：讓使用者點擊徽章上的數字時，能看到這個數字實際用了哪些原始
// 財報欄位、各自的值，跳轉到會計模式（GET /companies/financial-statement）對應的那一列。
// 現查現算，不持久化，跟 GET /companies/piotroski-breakdown 同一個模式。試點範圍見
// PILOT_PROVENANCE_METRIC_CODES 的說明——metricCode 用 z.enum 驗證，不支援的指標直接
// 被 zod 擋成 400，不是隱性涵蓋所有指標，吸取 dependsOn 的教訓。symbol 用路徑參數
// （不是 query），是這支端點跟其餘 /companies/* 端點刻意不同的地方，配合 web-nuxt
// 提議的路徑格式。實際的 metricCode → resolver 對應表見 provenanceResolvers.ts
// （2026-09-13 從這個檔案抽出去，避免每次擴大稽核鏈試點範圍都讓這支 controller 檔案
// 跟著長胖）。
export const getCompanyMetricProvenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricProvenanceQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const symbol = req.params.symbol;
    if (!symbol) {
      return res.status(400).json({ message: 'symbol is required.' });
    }

    const { metricCode, year, season } = validationResult.data;
    const result = await PROVENANCE_RESOLVERS[metricCode]({ symbol, year, season, dataType: '2', subsidiaryCompanyId: '' });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
