import { z } from 'zod';

export const usPolicyRateEventSchema = z.object({
  effectiveDate: z.string().meta({ description: '"YYYY-MM-DD" 調整生效日' }),
  targetUpper: z.number().meta({ description: '聯邦基金利率目標區間上限，百分比數字（4 代表 4%）。2008-12-16 以前是單一目標值，上下限同值' }),
  targetLower: z.number().meta({ description: '聯邦基金利率目標區間下限，百分比數字。2008-12-16 以前跟上限相同' }),
  changeBp: z.number().nullable().meta({
    description: '目標區間上限相對前一次調整的變動，基點（25 = 升息一碼、-25 = 降息一碼）；整段歷史的第一筆是 null。區間時代（2008-12-16 起）上下限差恆為 0.25 個百分點、Fed 每次兩邊同步調整，用上限或下限算結果相同；185 次調整裡唯一有歧義的是 2008-12-16（單一目標值 1% → 區間 0–0.25%）：以上限計 -75、以下限計 -100、以中點計 -87.5，這裡照慣例以上限計 -75（gov-ts 2026-09-29 逐列驗證）',
  }),
});
export type UsPolicyRateEvent = z.infer<typeof usPolicyRateEventSchema>;

export const usPolicyRateResultSchema = z.object({
  entries: z.array(usPolicyRateEventSchema).meta({ description: '依生效日由舊到新排序的調整事件；一列就是一次調整，不是逐日序列' }),
});
export type UsPolicyRateResult = z.infer<typeof usPolicyRateResultSchema>;
