import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getStockQuote, getStockPrices, getExDividendNotices } from './service';
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
