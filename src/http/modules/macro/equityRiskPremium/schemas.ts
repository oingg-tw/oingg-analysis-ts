import { z } from 'zod';

export const getEquityRiskPremiumQuerySchema = z.object({
  startYear: z.coerce.number().int().optional().meta({ description: '選填，窗口起始年（西元），要跟 startMonth 一起給', example: 1999 }),
  startMonth: z.coerce.number().int().min(1).max(12).optional().meta({ description: '選填，窗口起始月，要跟 startYear 一起給', example: 1 }),
  endYear: z.coerce.number().int().optional().meta({ description: '選填，窗口結束年（西元），要跟 endMonth 一起給' }),
  endMonth: z.coerce.number().int().min(1).max(12).optional().meta({ description: '選填，窗口結束月，要跟 endYear 一起給' }),
});

// 執行期驗證用的版本（成對檢查）——openapi.ts 文件化的是上面沒有 refine 的版本，跟以前一樣。
export const equityRiskPremiumQuerySchema = getEquityRiskPremiumQuerySchema
  .refine((v) => (v.startYear === undefined) === (v.startMonth === undefined), {
    message: 'startYear and startMonth must be provided together.',
  })
  .refine((v) => (v.endYear === undefined) === (v.endMonth === undefined), {
    message: 'endYear and endMonth must be provided together.',
  });
