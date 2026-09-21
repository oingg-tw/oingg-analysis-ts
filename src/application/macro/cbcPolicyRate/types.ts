import { z } from 'zod';

export const cbcPolicyRateEventSchema = z.object({
  effectiveDate: z.string().meta({ description: '"YYYY-MM-DD" 調整生效日（央行統計表只記生效日，沒有理監事會決議日；決議日通常是生效日前一個工作日）' }),
  discountRate: z.number().meta({ description: '重貼現率，百分比數字（2 代表 2%）——新聞講「升息半碼」的那支基準利率' }),
  collateralAccommodationRate: z.number().meta({ description: '擔保放款融通利率，百分比數字' }),
  unsecuredAccommodationRate: z.number().meta({ description: '短期融通利率（無擔保），百分比數字' }),
  changeBp: z.number().nullable().meta({ description: '重貼現率相對前一次調整的變動，基點（12.5 = 半碼升息、-12.5 = 半碼降息）；整段歷史的第一筆是 null' }),
});
export type CbcPolicyRateEvent = z.infer<typeof cbcPolicyRateEventSchema>;

export const cbcPolicyRateResultSchema = z.object({
  entries: z.array(cbcPolicyRateEventSchema).meta({ description: '依生效日由舊到新排序的調整事件；一列就是一次調整，不是逐日序列' }),
});
export type CbcPolicyRateResult = z.infer<typeof cbcPolicyRateResultSchema>;
