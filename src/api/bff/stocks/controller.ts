import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getStockQuote, getStockPrices, getExDividendNotices, getExDividendCalendar, getForeignShareholdingHistory } from './service';
import { logger } from '@/shared/logger';

export const getQuoteParamsSchema = z.object({
  symbol: z.string().min(1).meta({ description: '公司代號', example: '2330' }),
});
const paramsSchema = getQuoteParamsSchema;

export const getQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = paramsSchema.safeParse(req.params);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid path parameters.', errors: validationResult.error.format() });
    }

    const result = await getStockQuote(validationResult.data.symbol);
    if (!result) {
      return res.status(404).json({ message: `查無公司代號 ${validationResult.data.symbol}（上市、上櫃都沒有登記資料）。` });
    }
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Stock quote lookup failed:');
    next(error);
  }
};

// symbols 是明確列出「就是這幾檔」的請求，不是開放式查詢，所以限制的是「一次最多幾檔」
// （避免濫用打包過大的清單），不是用 limit 去截斷結果——超過上限要 400，不能默默只回一部分。
const MAX_SYMBOLS = 100;

export const symbolsQuerySchema = z.object({
  symbols: z.string({ error: 'symbols is required.' }).min(1).meta({ description: `逗號分隔的公司/ETF 代號清單，一次最多 ${MAX_SYMBOLS} 檔`, example: '2330,2317,2454' }),
});

const querySchema = symbolsQuerySchema.extend({
  symbols: symbolsQuerySchema.shape.symbols
    .transform((value) => value.split(',').map((s) => s.trim()).filter((s) => s.length > 0))
    .refine((symbols) => symbols.length > 0, { message: 'symbols 至少要有一個公司代號。' })
    .refine((symbols) => symbols.length <= MAX_SYMBOLS, { message: `symbols 一次最多 ${MAX_SYMBOLS} 檔，請分批查詢。` }),
});

export const getPrices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const result = await getStockPrices(validationResult.data.symbols);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Stock prices lookup failed:');
    next(error);
  }
};

export const getExDividendNoticesHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const result = await getExDividendNotices(validationResult.data.symbols);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Ex-dividend notices lookup failed:');
    next(error);
  }
};

// 2026-09-10 web-nuxt 轉達使用者需求：全市場除權息日曆（月曆格狀呈現）。month="YYYY-MM"
// 而不是 startDate/endDate 兩個參數——呼叫端本來就是月曆 UI 在一格一格選月份，直接傳月份
// 字串比自己算月初/月底日期再傳兩個日期參數更貼近使用情境，跟 fund_expense_ratio_annual
// 用整數年份（不是日期區間）當參數是同一種「參數形狀貼近呼叫端實際擁有的資料」的設計判斷。
export const getExDividendCalendarQuerySchema = z.object({
  month: z
    .string({ error: 'month is required.' })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'month 格式要是 "YYYY-MM"，例如 "2026-09"。' })
    .meta({ description: '要查詢的月份，"YYYY-MM"', example: '2026-09' }),
});

export const getExDividendCalendarHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getExDividendCalendarQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const [year, month] = validationResult.data.month.split('-').map(Number) as [number, number];
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0)); // 該月最後一天（下個月第 0 天 = 這個月最後一天）

    const result = await getExDividendCalendar(startDate, endDate);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Ex-dividend calendar lookup failed:');
    next(error);
  }
};

// 目前 export.foreign_shareholding 只回填了 2330（twse-ts 一次性回填，不是常態排程），
// 其他 symbol 一律回傳空陣列，不是 404——這不是「查無資料待補」的錯誤情境，是覆蓋率
// 限制，之後 twse-ts 擴大到全市場會自動生效，見 foreignShareholding.ts 的說明。
const MAX_FOREIGN_SHAREHOLDING_LIMIT = 1500; // 2330 目前累積約 1224 筆（2021-09~2026-09），留一點餘裕
export const getForeignShareholdingHistoryParamsSchema = getQuoteParamsSchema;
export const getForeignShareholdingHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_FOREIGN_SHAREHOLDING_LIMIT).default(250).meta({ description: `取最近幾個交易日，預設 250（約 1 年），上限 ${MAX_FOREIGN_SHAREHOLDING_LIMIT}。` }),
});

export const getForeignShareholdingHistoryHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramsResult = getForeignShareholdingHistoryParamsSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return res.status(400).json({ message: 'Invalid path parameters.', errors: paramsResult.error.format() });
    }
    const queryResult = getForeignShareholdingHistoryQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: queryResult.error.format() });
    }

    const result = await getForeignShareholdingHistory(paramsResult.data.symbol, queryResult.data.limit);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, 'Foreign shareholding history lookup failed:');
    next(error);
  }
};
