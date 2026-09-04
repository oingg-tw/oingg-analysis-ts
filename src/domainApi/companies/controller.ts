import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { listAllCompanyNames, countAllCompanyNames, getCompanyProfileDetail } from '@/shared/sourceData/companyProfile';
import { getCapitalStockHistory } from '@/shared/sourceData/capitalStock';

// limit 的「值」（這次要幾筆）由呼叫端（bff-ts）依他們的業務邏輯決定，每次請求可以不一樣，
// 本服務不代為決定；limit 的「上限」（最多允許幾筆）由本服務依自己扛不扛得住決定，所有請求
// 一致——2026-09-01 使用者訂的原則。payload 很輕（每筆只有兩個字串），上限抓寬鬆一點。
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
  // z.coerce.boolean() 是個陷阱——底層用 JS 的 Boolean(value)，query string 只要非空字串
  // （包含字面上的 "false"）一律轉成 true。用字串本身判斷才對。
  countOnly: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
});

export const getCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const { limit, offset, countOnly } = validationResult.data;

    if (countOnly) {
      const count = await countAllCompanyNames();
      return res.status(200).json({ count });
    }

    const { count, entries } = await listAllCompanyNames(limit, offset);
    res.status(200).json({ count, limit, offset, entries });
  } catch (error) {
    next(error);
  }
};

const profileQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1),
});

export const getCompanyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = profileQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const profile = await getCompanyProfileDetail(validationResult.data.symbol);
    if (!profile) return res.status(404).json({ message: `找不到公司代號 ${validationResult.data.symbol}。` });

    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
};

const capitalStockHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1),
});

// 查無資料回傳空陣列，不是 404——mops 這批資料目前不是每家公司都有覆蓋，「查無股本異動
// 歷史」是正常情境，不代表這家公司不存在（公司存不存在是 /companies/profile 負責判斷的事）。
export const getCompanyCapitalStockHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = capitalStockHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol } = validationResult.data;
    const entries = await getCapitalStockHistory(symbol);
    res.status(200).json({ symbol, entries });
  } catch (error) {
    next(error);
  }
};
