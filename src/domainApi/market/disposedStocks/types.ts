import { z } from 'zod';

export const disposedStocksQuerySchema = z.object({
  limit: z.number().meta({ description: '1~50，預設 20' }),
});
export type DisposedStocksQuery = z.infer<typeof disposedStocksQuerySchema>;

export const disposedStockRowSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  market: z.enum(['TWSE', 'TPEx']),
  announceDate: z.string(),
  announcementCount: z.number().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  reason: z.string().nullable(),
  reasonTimes: z.number().nullable().meta({ description: '從 reason 解析出的次數/連續營業日數，解析不出來時是 null' }),
  reasonShort: z.string().nullable().meta({ description: '從 reason 解析出的中文短標籤（例如「漲跌異常」「當沖比率異常」「轉(交)換公司債」），解析不出來時是 null' }),
  dispositionPeriod: z.string().nullable().meta({ description: '原始字串，例如「115/08/27～115/09/02」或「1150827~1150902」' }),
  dispositionStartDate: z.string().nullable().meta({ description: '從 dispositionPeriod 拆出的西元開始日期，解析不出來時是 null' }),
  dispositionEndDate: z.string().nullable(),
  dispositionMeasures: z.string().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  detail: z.string().nullable(),
  linkInformation: z.string().nullable().meta({ description: 'TPEx 版本沒有這個欄位，null' }),
  sixDayChangePercent: z.number().nullable().meta({ description: '以 announceDate 為基準日的近 6 個交易日累積漲跌幅（點對點），資料不足時是 null' }),
});
export type DisposedStockRow = z.infer<typeof disposedStockRowSchema>;

export const disposedStocksResultSchema = z.object({
  limit: z.number(),
  items: z.array(disposedStockRowSchema),
  warnings: z.array(z.string()),
});
export type DisposedStocksResult = z.infer<typeof disposedStocksResultSchema>;
