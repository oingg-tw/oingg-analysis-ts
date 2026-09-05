import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { listAllCompanyNames, countAllCompanyNames, getCompanyProfileDetail } from '@/shared/sourceData/companyProfile';
import { getCapitalStockHistory } from '@/shared/sourceData/capitalStock';
import { getRoeHistory } from '@/pitMetrics/roe/queryRoeHistory';
import type { CompanyRouteRequest, CompanyRouteResponse } from '@/shared/registerCompanyRoute';
import { runCompanyMetrics, CompanyMetricsValidationError } from './metricsService';

// limit 的「值」（這次要幾筆）由呼叫端（bff-ts）依他們的業務邏輯決定，每次請求可以不一樣，
// 本服務不代為決定；limit 的「上限」（最多允許幾筆）由本服務依自己扛不扛得住決定，所有請求
// 一致——2026-09-01 使用者訂的原則。payload 很輕（每筆只有兩個字串），上限抓寬鬆一點。
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

// 2026-09-05 起這些 query schema 改成 export——zod-to-openapi 的 Swagger 文件直接引用同一個
// schema 產生 parameters，不再像以前手寫 JSDoc 那樣是另一份要手動保持同步的東西。
export const getCompaniesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).meta({ description: `這次要拿幾筆，預設 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}。` }),
  offset: z.coerce.number().int().min(0).default(0).meta({ description: '跳過前面幾筆，預設 0。' }),
  // z.coerce.boolean() 是個陷阱——底層用 JS 的 Boolean(value)，query string 只要非空字串
  // （包含字面上的 "false"）一律轉成 true。用字串本身判斷才對。
  countOnly: z.string().optional().meta({ description: 'true 時只回總筆數（`{ count }`），不拉實際資料。' }),
});

const parsedGetCompaniesQuerySchema = getCompaniesQuerySchema.extend({
  countOnly: getCompaniesQuerySchema.shape.countOnly.transform((value) => value === 'true'),
});

export const getCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = parsedGetCompaniesQuerySchema.safeParse(req.query);
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

export const getCompanyProfileQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
});

export const getCompanyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyProfileQuerySchema.safeParse(req.query);
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

export const getCompanyCapitalStockHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
});

// 查無資料回傳空陣列，不是 404——mops 這批資料目前不是每家公司都有覆蓋，「查無股本異動
// 歷史」是正常情境，不代表這家公司不存在（公司存不存在是 /companies/profile 負責判斷的事）。
export const getCompanyCapitalStockHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyCapitalStockHistoryQuerySchema.safeParse(req.query);
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

// ROE 這支指標目前允許的 basis 只有這三種（見 src/pitMetrics/metricDefinitionRegistry.ts 的
// metricDefinitionRegistry.roe.allowedBases），這裡刻意獨立宣告成 query 參數的合法值，
// 不直接沿用通用的 metricBasisSchema（那個還有 CUM/FY，對 ROE 沒有意義）——兩邊要保持同步。
const ROE_HISTORY_BASIS_VALUES = ['Q', 'Q_ANN', 'TTM'] as const;
const MAX_ROE_HISTORY_LIMIT = 40; // 10 年份季度資料，畫圖情境不需要更多

export const getCompanyRoeHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  basis: z.enum(ROE_HISTORY_BASIS_VALUES).default('TTM').meta({ description: '單季(Q)/單季簡易年化(Q_ANN)/近四季(TTM)，預設 TTM' }),
  limit: z.coerce.number().int().min(1).max(MAX_ROE_HISTORY_LIMIT).default(20).meta({ description: '取最近幾期，預設 20（約 5 年季度資料），上限 40。' }),
});

// 給前端畫「ROE 歷史時序」圖表用——第一支直接讀 metric_values（point-in-time 架構）而不是
// profitability_roe 的對外端點，見 src/pitMetrics/roe/queryRoeHistory.ts 的說明。目前資料
// 覆蓋率極低（只有 spike 手動 backfill 過的少數公司），查無資料回傳 entries: []，不是 404
// 或錯誤——跟 getCompanyCapitalStockHistory 同一種「查無歷史資料是正常情境」的慣例。
export const getCompanyRoeHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyRoeHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, basis, limit } = validationResult.data;
    const entries = await getRoeHistory(symbol, basis, limit);
    res.status(200).json({ symbol, metricCode: 'roe', basis, entries });
  } catch (error) {
    next(error);
  }
};

const MAX_METRICS_FIELDS = 50;

export const getCompanyMetricsQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  fields: z.string({ error: 'fields is required.' }).min(1).meta({
    description: '逗號分隔的 "metricKey.fieldKey" 清單，1–50 個。',
    example: 'roe.roeQuarterlyPct,margins.grossMarginPct',
  }),
});

const parsedGetCompanyMetricsQuerySchema = getCompanyMetricsQuerySchema.extend({
  fields: getCompanyMetricsQuerySchema.shape.fields
    .transform((value) =>
      value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    )
    .refine((arr) => arr.length >= 1 && arr.length <= MAX_METRICS_FIELDS, `fields 要有 1–${MAX_METRICS_FIELDS} 個，用逗號分隔。`),
});

// api/bff 讀取優先：consolidated 單一公司指標查詢，取代原本 44 支各自現算的舊端點
// （見 src/api/bff/companies/metricsService.ts 的說明）。
export const getCompanyMetrics = async (req: CompanyRouteRequest, res: CompanyRouteResponse) => {
  const validationResult = parsedGetCompanyMetricsQuerySchema.safeParse(req.query);
  if (!validationResult.success) {
    res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    return undefined;
  }

  const { symbol, fields } = validationResult.data;
  try {
    return await runCompanyMetrics(symbol, fields);
  } catch (error) {
    if (error instanceof CompanyMetricsValidationError) {
      res.status(400).json({ message: error.message });
      return undefined;
    }
    throw error;
  }
};
