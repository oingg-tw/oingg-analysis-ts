import { z } from 'zod';

const rate = (description: string) => z.number().nullable().meta({ description });
const changeBp = (name: string) =>
  z.number().nullable().meta({
    description: `${name}相對前一次調整的變動，基點（25 = 一碼）；整段歷史的第一筆、或前後任一筆是 null 時為 null。三支利率不一定同步調整，這次沒動的那支是 0（不是 null）`,
  });

export const ecbPolicyRateEventSchema = z.object({
  effectiveDate: z.string().meta({ description: '"YYYY-MM-DD" 調整生效日' }),
  depositFacilityRate: rate('存款機制利率（DFR），百分比數字（2.5 代表 2.5%），可為負（2014-06～2022-07）'),
  mainRefinancingRate: rate('主要再融資利率（MRO），百分比數字。2000-06-28～2008-10-14 是變動利率標售的最低投標利率，見 mainRefinancingIsMinimumBid'),
  marginalLendingRate: rate('邊際貸款機制利率（MLF），百分比數字'),
  mainRefinancingIsMinimumBid: z.boolean().meta({ description: 'true = 這段期間 MRO 是變動利率標售的「最低投標利率」，不是固定標售利率；數字仍連續可畫' }),
  depositFacilityChangeBp: changeBp('存款機制利率'),
  mainRefinancingChangeBp: changeBp('主要再融資利率'),
  marginalLendingChangeBp: changeBp('邊際貸款機制利率'),
});
export type EcbPolicyRateEvent = z.infer<typeof ecbPolicyRateEventSchema>;

export const ecbPolicyRateResultSchema = z.object({
  entries: z.array(ecbPolicyRateEventSchema).meta({ description: '依生效日由舊到新排序的調整事件；一列就是一次調整，不是逐日序列' }),
});
export type EcbPolicyRateResult = z.infer<typeof ecbPolicyRateResultSchema>;
