import { z } from 'zod';

// 2026-10-05 逐檔 ETF 收益分配（使用者同意 web-nuxt 持股頁需求：預估年度股利、含息報酬要逐次配息）。
export const etfDistributionEventSchema = z.object({
  exDividendDate: z.string().meta({ description: '除息日（YYYY-MM-DD）' }),
  recordDate: z.string().nullable().meta({ description: '收益分配基準日' }),
  paymentDate: z.string().nullable().meta({ description: '收益分配發放日' }),
  distributionPerUnit: z.number().nullable().meta({ description: '每受益權單位分配金額（元）；預告列金額尚未公布時為 null' }),
  status: z.enum(['announced', 'realized']).meta({ description: 'realized＝除息日早於今天（已實現）；announced＝今天或之後（預告）。跟 GET /stocks/ex-dividend-calendar 同一個判斷' }),
});

export const etfDistributionsResultSchema = z.object({
  symbol: z.string(),
  found: z.boolean().meta({ description: 'false＝來源裡這個代號一筆收益分配紀錄都沒有（不是 ETF、或從未配息、或未收錄，分不出來）' }),
  trailing12MonthDistributionPerUnit: z.number().nullable().meta({
    description:
      '近 12 個月（除息日落在 今天往前一年（不含）～ 昨天）已實現的每單位配息加總（元）。沒有任何紀錄（found=false）為 null；' +
      '有紀錄但近 12 個月沒有配息為 0。不含預告列。',
  }),
  trailing12MonthWindow: z.object({ start: z.string(), end: z.string() }).meta({ description: '近 12 個月窗口的起訖日（含），方便標示「截至 {end}」' }),
  events: z.array(etfDistributionEventSchema).meta({ description: '全部收益分配紀錄，依除息日由舊到新（含預告列）' }),
});

export type EtfDistributionEvent = z.infer<typeof etfDistributionEventSchema>;
export type EtfDistributionsResult = z.infer<typeof etfDistributionsResultSchema>;
