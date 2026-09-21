import { z } from 'zod';

export const monthlySeriesQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .meta({ description: '只回傳 period >= 這個月（"YYYY-MM"）的資料；不給就回全部歷史。' }),
});

export const quarterlySeriesQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-Q[1-4]$/)
    .optional()
    .meta({ description: '只回傳 period >= 這一季（"YYYY-Qn"）的資料；不給就回全部歷史。' }),
});

// 跟 market/taiexDailyPrice/schemas.ts 同一套 limit/interval 慣例。
const MAX_DAILY_LIMIT = 2000;
export const usdTwdRateQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_DAILY_LIMIT).default(250).meta({ description: `取最近幾筆，預設 250，上限 ${MAX_DAILY_LIMIT}。` }),
  interval: z
    .enum(['daily', 'weekly', 'monthly'])
    .default('daily')
    .meta({ description: '粒度：daily 逐日；weekly/monthly 每週（週一起算）/每月取最後一個有資料的日子。資料 1992-01 起。' }),
});

// gov-ts export.monthly_cpi / quarterly_gdp 的 category 值（2026-09-22 從 view 實際列出）。之後 gov-ts 加類別要同步這裡。
export const CPI_CATEGORIES = ['total', 'food', 'clothing', 'housing', 'transport_communication', 'medical', 'education_recreation', 'misc'] as const;
export const GDP_CATEGORIES = [
  'growth_rate',
  'domestic_demand_total',
  'private_consumption',
  'government_consumption',
  'fixed_capital_formation_total',
  'fixed_capital_formation_private',
  'fixed_capital_formation_government',
  'fixed_capital_formation_public_enterprise',
  'inventory_change',
  'net_external_demand_total',
  'exports',
  'imports',
] as const;

export const cpiQuerySchema = monthlySeriesQuerySchema.extend({
  category: z.enum(CPI_CATEGORIES).default('total').meta({ description: '總指數或七大類，預設 total。' }),
});
export const gdpQuerySchema = quarterlySeriesQuerySchema.extend({
  category: z.enum(GDP_CATEGORIES).default('growth_rate').meta({ description: '經濟成長率或需求面 11 個項目，預設 growth_rate。' }),
});
