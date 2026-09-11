import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { listAllCompanyNames, countAllCompanyNames, getCompanyProfileDetail, getCompanyNamesForSymbols, getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';
import { getCapitalStockHistory } from '@/shared/sourceData/capitalStock';
import { getRoeHistory } from '@/domainPitMetrics/profitability/roe/queryRoeHistory';
import { getRoaHistory } from '@/domainPitMetrics/profitability/roa/queryRoaHistory';
import { getDupontHistory } from '@/domainPitMetrics/shared/dupont/queryDupontHistory';
import { getMetricHistory } from '@/domainPitMetrics/queryMetricHistory';
import { getDailyCadenceMetricHistory } from '@/domainPitMetrics/queryDailyCadenceMetricHistory';
import { getMultiMetricHistory } from '@/domainPitMetrics/queryMultiMetricHistory';
import { getMonthlyRevenueHistory } from '@/shared/sourceData/monthlyRevenue';
import { resolveTokenForMetric, ScreenerValidationError } from '@/api/bff/screener/fieldResolver';
import type { PeriodType } from '@/domainPitMetrics/metricBasis';
import { findPeerGroup } from '@/shared/sourceData/industryClassification';
import { getLatestAvailableQuarter, type StatementSource } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFull } from '@/shared/sourceData/balanceSheetXbrlFull';
import { getIncomeStatementXbrlFull } from '@/shared/sourceData/incomeStatementXbrlFull';
import { getXbrlCashFlowQuarterly } from '@/shared/sourceData/xbrlCashFlowQuarterly';
import { getPiotroskiFScoreBreakdown } from '@/domainPitMetrics/quality/piotroskiFScore/getPiotroskiFScoreBreakdown';
import { getRoeProvenance } from '@/domainPitMetrics/profitability/roe/getRoeProvenance';
import { getChowderNumberProvenance } from '@/domainPitMetrics/dividend/chowderNumber/getChowderNumberProvenance';
import { getSueProvenance } from '@/domainPitMetrics/growth/sue/getSueProvenance';
import { getAccrualsRatioProvenance } from '@/domainPitMetrics/quality/accrualsRatio/getAccrualsRatioProvenance';
import { getDividendPayoutRatioProvenance } from '@/domainPitMetrics/dividend/dividendPayoutRatio/getDividendPayoutRatioProvenance';
import { getAltmanZScoreProvenance } from '@/domainPitMetrics/resilience/altmanZScore/getAltmanZScoreProvenance';
import { PILOT_PROVENANCE_METRIC_CODES, type MetricProvenanceResult } from '@/domainPitMetrics/provenance/provenanceTypes';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import type { Season } from '@/shared/rocQuarter';

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

// ROE 這支指標目前允許的 periodType 只有這三種（見 src/domainPitMetrics/metricDefinitionRegistry.ts
// 的 metricDefinitionRegistry.roe.allowedPeriodTypes），這裡刻意獨立宣告成 query 參數的合法值，
// 不直接沿用通用的 periodTypeSchema（那個還有 YTD/FY，對 ROE 沒有意義）——兩邊要保持同步。
// 2026-09-08：這個 query 參數原本叫 basis，改名 periodType 是這次「metric_values.basis 拆成
// 四個精準命名欄位」重構的一部分（basis 違反 ubiquitous language，見 abstract-crafting-
// journal.md），不是單純改名，是外部契約 breaking change。
const ROE_HISTORY_PERIOD_TYPE_VALUES = ['Q', 'Q_ANN', 'TTM'] as const;
const MAX_ROE_HISTORY_LIMIT = 40; // 10 年份季度資料，畫圖情境不需要更多

export const getCompanyRoeHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  periodType: z.enum(ROE_HISTORY_PERIOD_TYPE_VALUES).default('TTM').meta({ description: '單季(Q)/單季簡易年化(Q_ANN)/近四季(TTM)，預設 TTM' }),
  limit: z.coerce.number().int().min(1).max(MAX_ROE_HISTORY_LIMIT).default(20).meta({ description: '取最近幾期，預設 20（約 5 年季度資料），上限 40。' }),
});

// 給前端畫「ROE 歷史時序」圖表用——第一支直接讀 metric_values（point-in-time 架構）而不是
// profitability_roe 的對外端點，見 src/domainPitMetrics/profitability/roe/queryRoeHistory.ts 的說明。目前資料
// 覆蓋率極低（只有 spike 手動 backfill 過的少數公司），查無資料回傳 entries: []，不是 404
// 或錯誤——跟 getCompanyCapitalStockHistory 同一種「查無歷史資料是正常情境」的慣例。
export const getCompanyRoeHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyRoeHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, periodType, limit } = validationResult.data;
    const { entries, total, hasMore } = await getRoeHistory(symbol, periodType, limit);
    res.status(200).json({ symbol, metricCode: 'roe', periodType, total, hasMore, entries });
  } catch (error) {
    next(error);
  }
};

// ROA 這支指標目前允許的 periodType 跟 ROE 一模一樣（見
// src/domainPitMetrics/metricDefinitionRegistry.ts 的 metricDefinitionRegistry.roa.allowedPeriodTypes）。
const ROA_HISTORY_PERIOD_TYPE_VALUES = ['Q', 'Q_ANN', 'TTM'] as const;
const MAX_ROA_HISTORY_LIMIT = 40;

export const getCompanyRoaHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  periodType: z.enum(ROA_HISTORY_PERIOD_TYPE_VALUES).default('TTM').meta({ description: '單季(Q)/單季簡易年化(Q_ANN)/近四季(TTM)，預設 TTM' }),
  limit: z.coerce.number().int().min(1).max(MAX_ROA_HISTORY_LIMIT).default(20).meta({ description: '取最近幾期，預設 20（約 5 年季度資料），上限 40。' }),
});

// 給前端畫「ROA 歷史時序」圖表用，完全比照 getCompanyRoeHistory 的模式（第二支直接讀
// metric_values 的端點）。查無資料回傳 entries: []，不是 404。
export const getCompanyRoaHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyRoaHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, periodType, limit } = validationResult.data;
    const { entries, total, hasMore } = await getRoaHistory(symbol, periodType, limit);
    res.status(200).json({ symbol, metricCode: 'roa', periodType, total, hasMore, entries });
  } catch (error) {
    next(error);
  }
};

// Dupont 拆解沒有 Q_ANN——dupontDecomposedRoe/equityMultiplier 都沒有這個變體（見
// src/domainPitMetrics/metricDefinitionRegistry.ts 的 metricDefinitionRegistry.dupontDecomposedRoe/
// equityMultiplier.allowedPeriodTypes）。
const DUPONT_HISTORY_PERIOD_TYPE_VALUES = ['Q', 'TTM'] as const;
const MAX_DUPONT_HISTORY_LIMIT = 40;

export const getCompanyDupontHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  periodType: z.enum(DUPONT_HISTORY_PERIOD_TYPE_VALUES).default('Q').meta({ description: '單季(Q)/近四季(TTM)，預設 Q' }),
  limit: z.coerce.number().int().min(1).max(MAX_DUPONT_HISTORY_LIMIT).default(20).meta({ description: '取最近幾期，預設 20（約 5 年季度資料），上限 40。' }),
});

// 給前端畫「杜邦拆解」圖表用——這批遷移嚴格需要的最小集合（淨利率/總資產週轉率兩個因子 +
// 權益乘數 + 組裝出來的 ROE），不是完整的毛利率/週轉率家族，見
// src/domainPitMetrics/shared/dupont/queryDupontHistory.ts 的說明。periodType=TTM 時
// equityMultiplier 恆為 null。查無資料回傳 entries: []，不是 404。
export const getCompanyDupontHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyDupontHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, periodType, limit } = validationResult.data;
    const { entries, total, hasMore } = await getDupontHistory(symbol, periodType, limit);
    res.status(200).json({ symbol, periodType, total, hasMore, entries });
  } catch (error) {
    next(error);
  }
};

const MAX_METRIC_HISTORY_LIMIT = 40;

export const getCompanyMetricHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  metricCode: z
    .string({ error: 'metricCode is required.' })
    .min(1)
    .meta({ description: 'point-in-time 架構的指標代碼，例如 "eps"、"bvps"——完整清單見 metricDefinitionRegistry.ts，之後新增指標會持續增加', example: 'eps' }),
  token: z
    .string({ error: 'token is required.' })
    .min(1)
    .meta({ description: "'Q'/'YTD'/'TTM'/'Q_ANN'/'FY' 之一（季報型），或 '<lookbackRange>_<samplingInterval>'（滾動統計量，例如 '2Y_1W'），或 'EOD'（市場快照）——實際允許哪些由 metricCode 決定，不符合會回 400，可用組合見 GET /metrics" }),
  limit: z.coerce.number().int().min(1).max(MAX_METRIC_HISTORY_LIMIT).default(20).meta({ description: `取最近幾期，預設 20（約 5 年季度資料），上限 ${MAX_METRIC_HISTORY_LIMIT}。` }),
});

// 泛化版的單一 metric_code 歷史查詢端點——2026-09-06 point-in-time 架構第三批遷移（10 個
// 新 metric_code）動工前新增，取代「每遷一支指標就在這三個檔案各自複製貼上一段」的模式
// （roe-history/roa-history 就是這樣長出來的）。metricCode/token 都不是寫死的 zod enum，
// 而是動態查 metricDefinitionRegistry——這份 registry 之後會持續成長，沒辦法每次新增指標
// 都回來改一次這裡的型別。roe-history/roa-history/dupont-history 三支既有端點維持不動，
// 這支只是之後新增指標的曝露管道，不是要取代它們（dupont-history 是真正的多 metric_code
// 組合，泛化不適用；另外兩支沒有壞掉，不用強行改掉可能已經在用的呼叫端）。
// 2026-09-08：query 參數原本叫 basis（單一字串直接對應 metric_values.basis 欄位），改名
// token 並改用 resolveTokenForMetric（跟 screener/fieldResolver.ts 的 "metricCode.token"
// 解析共用同一套四組判斷邏輯）——這是「metric_values.basis 拆成四個精準命名欄位」重構
// 的一部分，basis 這個字本身違反 ubiquitous language，見 abstract-crafting-journal.md。
export const getCompanyMetricHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, metricCode, token, limit } = validationResult.data;
    let fieldRef;
    try {
      fieldRef = resolveTokenForMetric(metricCode, token, `${metricCode}.${token}`);
    } catch (error) {
      if (error instanceof ScreenerValidationError) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }

    // 2026-09-09：逐日型指標（beta/exchangePeRatio 等）拆表後查的是不同的 Prisma model/
    // 去重邏輯，見 queryDailyCadenceMetricHistory.ts 的說明——依 FieldRef.isDailyCadence
    // 分流，呼叫端（這裡）完全不用知道背後是哪張表。
    const { entries, total, hasMore } = fieldRef.isDailyCadence
      ? await getDailyCadenceMetricHistory(symbol, metricCode, { lookbackRange: fieldRef.lookbackRange, samplingInterval: fieldRef.samplingInterval, snapshotCadence: fieldRef.snapshotCadence }, '2', '', limit)
      : await getMetricHistory(symbol, metricCode, fieldRef.periodType, '2', '', limit);
    res.status(200).json({ symbol, metricCode, token, total, hasMore, entries });
  } catch (error) {
    next(error);
  }
};

const MAX_METRIC_CODES_PER_REQUEST = 10;

export const getCompanyMetricsHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  metricCodes: z
    .string({ error: 'metricCodes is required.' })
    .min(1)
    .meta({ description: `逗號分隔的 metricCode 清單，例如 "grossMargin,operatingMargin,netProfitMargin"（最多 ${MAX_METRIC_CODES_PER_REQUEST} 個）`, example: 'grossMargin,operatingMargin,netProfitMargin' }),
  token: z
    .string({ error: 'token is required.' })
    .min(1)
    .meta({ description: "'Q'/'YTD'/'TTM'/'Q_ANN'/'FY' 之一（季報型），或 '<lookbackRange>_<samplingInterval>'（滾動統計量），或 'EOD'（市場快照），套用到清單裡的每個 metricCode，任一個不允許就整體回 400，可用組合見 GET /metrics" }),
  limit: z.coerce.number().int().min(1).max(MAX_METRIC_HISTORY_LIMIT).default(20).meta({ description: `取最近幾期，預設 20（約 5 年季度資料），上限 ${MAX_METRIC_HISTORY_LIMIT}。` }),
});

// 泛化版的「一次抓多個 metric_code」歷史查詢端點——2026-09-07 使用者要「五年三率」（毛利率/
// 營業利益率/淨利率）一次拿齊時新增。跟 dupont-history 不同：dupont-history 是特定家族寫死
// 具名欄位的組合端點；這支是任意 metricCode 清單、用 metricCode 當 key 合併回傳，不要求
// 彼此有語意組裝關係。token 對清單裡每個 metricCode 都要合法，只要有一個不允許就整體回 400
// （附上是哪個 metricCode 不允許），不會部分成功。
// 2026-09-08：query 參數原本叫 basis，改名 token（理由同 getCompanyMetricHistory 上方註解）。
export const getCompanyMetricsHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricsHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, token, limit } = validationResult.data;
    const metricCodes = [...new Set(validationResult.data.metricCodes.split(',').map((code) => code.trim()).filter((code) => code.length > 0))];

    if (metricCodes.length === 0) {
      return res.status(400).json({ message: 'metricCodes 至少要指定一個。' });
    }
    if (metricCodes.length > MAX_METRIC_CODES_PER_REQUEST) {
      return res.status(400).json({ message: `metricCodes 最多 ${MAX_METRIC_CODES_PER_REQUEST} 個，收到 ${metricCodes.length} 個。` });
    }

    // 2026-09-09：逐日型指標（beta/exchangePeRatio 等）刻意不支援多指標一次查——沒有
    // 實際情境會把 beta 跟其他 metricCode 混在同一次多指標查詢裡，硬做這個組合的複雜度
    // 換不到實際使用價值，見 abstract-crafting-journal.md 的拆表決策。偵測到任一
    // metricCode 是逐日型就直接 400，附上請改走 metric-history 逐一查詢的訊息。
    let periodType: PeriodType | undefined;
    for (const metricCode of metricCodes) {
      let fieldRef;
      try {
        fieldRef = resolveTokenForMetric(metricCode, token, `${metricCode}.${token}`);
      } catch (error) {
        if (error instanceof ScreenerValidationError) {
          return res.status(400).json({ message: error.message });
        }
        throw error;
      }
      if (fieldRef.isDailyCadence) {
        return res.status(400).json({ message: `metricCode "${metricCode}" 是逐日型指標，metrics-history 目前不支援逐日型指標一次查詢多個，請改用 GET /companies/metric-history 逐一查詢。` });
      }
      periodType ??= fieldRef.periodType;
    }

    const { entries, total, hasMore } = await getMultiMetricHistory(symbol, metricCodes, periodType!, '2', '', limit);
    res.status(200).json({ symbol, metricCodes, token, total, hasMore, entries });
  } catch (error) {
    next(error);
  }
};

const MAX_MONTHLY_REVENUE_HISTORY_LIMIT = 120; // 上限抓 10 年份，目前資料只有 2330 60 個月，上限只是預留空間

export const getCompanyMonthlyRevenueHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MONTHLY_REVENUE_HISTORY_LIMIT)
    .default(60)
    .meta({ description: `取最近幾個月，預設 60（5 年），上限 ${MAX_MONTHLY_REVENUE_HISTORY_LIMIT}。` }),
});

// 月營收歷史——**目前只有 2330 有資料**（twse-ts 2026-09-07 一次性手動回填，
// 2021-08~2026-07 共 60 個月，不是常態每日更新的管道，見
// src/adapters/prisma/twseExportDevClient.ts 的完整說明）。查其他公司代號會正確回
// entries: []（不是 404 或錯誤），跟 getCompanyCapitalStockHistory 同一種「查無歷史
// 資料是正常情境」的慣例——不要誤以為這是全市場即時月營收功能。
export const getCompanyMonthlyRevenueHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMonthlyRevenueHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, limit } = validationResult.data;
    const { entries, total, hasMore } = await getMonthlyRevenueHistory(symbol, limit);
    res.status(200).json({ symbol, total, hasMore, entries });
  } catch (error) {
    next(error);
  }
};

const FINANCIAL_STATEMENT_TYPES = ['balanceSheet', 'incomeStatement', 'cashFlowStatement'] as const;

export const getCompanyFinancialStatementQuerySchema = z
  .object({
    symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
    statementType: z
      .enum(FINANCIAL_STATEMENT_TYPES, { error: 'statementType is required, 必須是 balanceSheet/incomeStatement/cashFlowStatement 之一。' })
      .meta({ description: '會計模式要看哪一張表：balanceSheet(資產負債表)/incomeStatement(損益表)/cashFlowStatement(現金流量表)', example: 'balanceSheet' }),
    year: z
      .string()
      .regex(/^\d{2,3}$/, 'year 必須是民國年數字字串，例如 "115"。')
      .optional()
      .meta({ description: '民國年，例如 "115"；跟 season 要成對提供，不給就自動抓該張表最新一季', example: '115' }),
    season: z.enum(['1', '2', '3', '4']).optional().meta({ description: '季別 1-4；跟 year 要成對提供' }),
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), {
    message: 'year 和 season 必須成對提供，只給其中一個是無效請求。',
    path: ['season'],
  });

// object（不是 Record<string, unknown>）——這幾支 getXxx 函式各自回傳不同形狀的物件，
// 有些是具名 interface（沒有索引簽章，賦值到 Record<string, unknown> 會被 TS 拒絕），
// 有些是動態欄位的泛化物件；object 沒有這個限制，取用時再用 Object.entries 轉成一般
// 物件遍歷。
type FinancialStatementRow = object;

// 現金流量表沒有 XBRL 寬表，是長表格式（xbrl_three_statements_long），
// getXbrlCashFlowQuarterly 回傳 { reportDate, accounts: Record<string, bigint> }——這裡
// 把 accounts 攤平成跟 balanceSheet/incomeStatement 一致的扁平物件形狀。2026-09-11
// 舊三大表（quarterly_cash_flow_statement，mopsQuarterlyStatements.ts）已退役，查無
// XBRL 資料直接回傳 null，不再 fallback。
const getCashFlowStatementXbrlFull = async (key: {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}): Promise<FinancialStatementRow | null> => {
  const xbrl = await getXbrlCashFlowQuarterly(key);
  return xbrl ? { reportDate: xbrl.reportDate, ...xbrl.accounts } : null;
};

const STATEMENT_FETCHERS: Record<
  (typeof FINANCIAL_STATEMENT_TYPES)[number],
  (key: { symbol: string; year: number; quarter: number; dataType: string; subsidiaryCompanyId: string }) => Promise<FinancialStatementRow | null>
> = {
  balanceSheet: getBalanceSheetXbrlFull,
  incomeStatement: getIncomeStatementXbrlFull,
  cashFlowStatement: getCashFlowStatementXbrlFull,
};

// 三張表的 identity 欄位（symbol/year/quarter/dataType/subsidiaryCompanyId/reportDate）
// 已經在回應最外層給過一次，statement 物件裡只留純科目欄位，不重複。
const STATEMENT_IDENTITY_FIELDS = new Set(['symbol', 'year', 'quarter', 'dataType', 'subsidiaryCompanyId', 'reportDate']);

// 財報金額欄位都是 bigint，序列化成字串避免 JS 數字精度問題——跟 companyProfileDetailSchema
// 的 paidInCapital 那批欄位同一個慣例。非 bigint 的欄位（例如 XBRL numeric 型別）原樣
// 透傳，不強制轉型。
const serializeStatementRow = (row: FinancialStatementRow): Record<string, string | null> => {
  const result: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (STATEMENT_IDENTITY_FIELDS.has(key)) continue;
    result[key] = typeof value === 'bigint' ? value.toString() : (value as string | null);
  }
  return result;
};

// 「會計模式」用——前端選定一張表（資產負債表/損益表/現金流量表），一次拿到該季全部科目
// 欄位（不是算好的單一比率），符合傳統看報表的習慣，跟 point-in-time 那套算好的指標歷史
// （roe-history 那些）刻意分開，資料來源相同（mops-ts 的三張季報表 export view），只是
// 這裡整列透傳不做任何計算。dataType 固定用合併報表（'2'）、subsidiaryCompanyId 固定空
// 字串——跟 metric-history 同一個慣例，不對外曝露這兩個內部參數。查無資料（該公司這張表
// 完全沒有資料，或指定的 year/season 那一季沒有資料）回傳 200 + found:false，不是 404，
// 跟 roe-history/capital-stock-history 同一種「查無歷史資料是正常情境」的慣例。
export const getCompanyFinancialStatement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyFinancialStatementQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, statementType, year, season } = validationResult.data;
    const dataType = '2';
    const subsidiaryCompanyId = '';

    const resolvedQuarter =
      year !== undefined && season !== undefined
        ? { year, season: season as Season }
        : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, [statementType as StatementSource]);

    if (!resolvedQuarter) {
      return res.status(200).json({ symbol, statementType, dataType, subsidiaryCompanyId, year: null, season: null, reportDate: null, found: false, statement: null });
    }

    const key = { symbol, year: Number(resolvedQuarter.year), quarter: Number(resolvedQuarter.season), dataType, subsidiaryCompanyId };
    const row = await STATEMENT_FETCHERS[statementType](key);

    if (!row) {
      return res.status(200).json({
        symbol,
        statementType,
        dataType,
        subsidiaryCompanyId,
        year: resolvedQuarter.year,
        season: resolvedQuarter.season,
        reportDate: null,
        found: false,
        statement: null,
      });
    }

    const reportDate = (row as { reportDate: Date }).reportDate;
    res.status(200).json({
      symbol,
      statementType,
      dataType,
      subsidiaryCompanyId,
      year: resolvedQuarter.year,
      season: resolvedQuarter.season,
      reportDate: reportDate.toISOString().slice(0, 10),
      found: true,
      statement: serializeStatementRow(row),
    });
  } catch (error) {
    next(error);
  }
};

export const getCompanyPeerGroupQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  minPeers: z.coerce.number().int().min(1).max(50).default(3).meta({ description: '同業數（含自己）低於這個門檻就往更粗的層級回退，預設 3。' }),
});

// 給前端「產業同業比較」功能用——找出同業清單，不含財務指標數值：呼叫端拿到 peers 之後
// 應該自己再打 POST /screener/values（symbols + columns）查實際指標數值，這支端點跟
// screener/values 是刻意分開的兩支，不重複做數值查詢那一層。2026-09-08：screener 這套
// 查詢引擎已經重建成直接讀 pitMetrics 的 metric_values（field 格式改成
// "metricCode.basis"，例如 "roe.TTM"，見 GET /metrics 的可用清單），不是原本靠
// metricTableRegistry 解析舊架構表的那套（那套已隨無真實依賴的 filterCatalog 一起退場）。
// 用動態層級回退（子類→細類→小類→中類）找同業，見
// src/shared/sourceData/industryClassification.ts 的說明。
//
// 查無分類資料（found: false）分兩種成因，這支端點刻意不區分：(1) 這家公司是真實存在、可
// 交易的公司，但 gov-ts 這批稅籍分類資料沒涵蓋到（例如資料落後）；(2) symbol 打錯或根本
// 不是真實存在的證券——驗證「公司存不存在」是 /companies/profile 的職責，這支端點不重複做。
// 唯一的例外是 KY 股（境外註冊公司，結構上沒有台灣稅籍，永遠不會有分類資料）：這是一個
// 系統性、可預期的缺口，不是隨機的資料落後，所以會額外查一次 shortName 判斷，命中就在
// warnings 明確提醒呼叫端「請在呼叫前先篩掉 KY 股」，不要讓上游誤以為是暫時性的資料缺漏。
export const getCompanyPeerGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyPeerGroupQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, minPeers } = validationResult.data;
    const candidatePool = await getSecuritySymbolSet({ preferredStock: 'exclude' });
    const result = findPeerGroup(symbol, candidatePool, minPeers);

    if (!result.found) {
      const warnings: string[] = [];
      const profile = await getCompanyProfileDetail(symbol);
      if (profile?.shortName?.includes('-KY')) {
        warnings.push('這是境外註冊（KY）公司，沒有台灣稅籍登記，本服務的產業分類資料（來源：財政部稅籍登記）結構上無法涵蓋，不是暫時性的資料缺漏——請在呼叫前先篩掉 KY 股，不要送進這支端點。');
      }
      return res.status(200).json({ symbol, companyName: profile?.shortName ?? null, found: false, industryLevel: null, industryCode: null, industryName: null, peers: [], warnings });
    }

    const nameMap = await getCompanyNamesForSymbols(result.peers);
    res.status(200).json({
      symbol,
      companyName: nameMap.get(symbol) ?? null,
      found: true,
      industryLevel: result.level,
      industryCode: result.code,
      industryName: result.name,
      peers: result.peers.map((s) => ({ symbol: s, companyName: nameMap.get(s) ?? null })),
      warnings: result.level === 'division' ? [`同業數在較細的層級不足 ${minPeers} 家，已回退到最粗的「中類」層級（${result.name ?? result.code}），同業裡可能包含商業模式不同的公司，請自行判斷比較的參考價值。`] : [],
    });
  } catch (error) {
    next(error);
  }
};

export const getCompanyPiotroskiBreakdownQuerySchema = z
  .object({
    symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
    year: z
      .string()
      .regex(/^\d{2,3}$/, 'year 必須是民國年數字字串，例如 "115"。')
      .optional()
      .meta({ description: '民國年，例如 "115"；跟 season 要成對提供，不給就自動抓最新一季', example: '115' }),
    season: z.enum(['1', '2', '3', '4']).optional().meta({ description: '季別 1-4；跟 year 要成對提供' }),
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), {
    message: 'year 和 season 必須成對提供，只給其中一個是無效請求。',
    path: ['season'],
  });

// 2026-09-10 web-nuxt 要求：piotroskiFScore 只寫入最終 0-9 分（見
// computePiotroskiFScorePit.ts 的說明），9 個子訊號本身不是獨立可篩選的指標，故不走
// metric-history 那套、不新增 metric_code，另開這支端點現查現算，依 Piotroski (2000)
// 原始論文的分組回傳（獲利能力/財務槓桿與流動性/營運效率），分組內子分數留給前端自己算
// （只是瑣碎算術）。查無資料（found: false）是正常情境，不是 404，跟 financial-statement/
// roe-history 同一種慣例。
export const getCompanyPiotroskiBreakdown = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyPiotroskiBreakdownQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, year, season } = validationResult.data;
    const breakdown = await getPiotroskiFScoreBreakdown({ symbol, year, season, dataType: '2', subsidiaryCompanyId: '' });
    res.status(200).json(breakdown);
  } catch (error) {
    next(error);
  }
};

export const getCompanyMetricProvenanceQuerySchema = z
  .object({
    metricCode: z.enum(PILOT_PROVENANCE_METRIC_CODES, { error: 'metricCode is required, 目前僅支援 sue/chowderNumber/roe。' }),
    year: z
      .string()
      .regex(/^\d{2,3}$/, 'year 必須是民國年數字字串，例如 "115"。')
      .optional()
      .meta({ description: '民國年，例如 "115"；跟 season 要成對提供，不給就自動抓最新一季', example: '115' }),
    season: z.enum(['1', '2', '3', '4']).optional().meta({ description: '季別 1-4；跟 year 要成對提供' }),
  })
  .refine((data) => (data.year === undefined) === (data.season === undefined), {
    message: 'year 和 season 必須成對提供，只給其中一個是無效請求。',
    path: ['season'],
  });

// metricCode → 對應 resolver 的 dispatch table——之後新增第 4/5 支試點指標，只需要在
// PILOT_PROVENANCE_METRIC_CODES（provenanceTypes.ts）加一個值、寫一個對應的
// get<Metric>Provenance.ts、在這裡的 dispatch table 加一行，不需要碰其餘 controller/
// route/openapi/types 邏輯。roe 目前固定用 TTM basis（見 getRoeProvenance.ts 的說明）。
const PROVENANCE_RESOLVERS: Record<(typeof PILOT_PROVENANCE_METRIC_CODES)[number], (query: QuarterlyMetricQuery) => Promise<MetricProvenanceResult>> = {
  roe: getRoeProvenance,
  chowderNumber: getChowderNumberProvenance,
  sue: getSueProvenance,
  accrualsRatio: getAccrualsRatioProvenance,
  dividendPayoutRatio: getDividendPayoutRatioProvenance,
  altmanZScore: getAltmanZScoreProvenance,
};

// 2026-09-10 web-nuxt 要求：讓使用者點擊徽章上的數字時，能看到這個數字實際用了哪些原始
// 財報欄位、各自的值，跳轉到會計模式（GET /companies/financial-statement）對應的那一列。
// 現查現算，不持久化，跟 GET /companies/piotroski-breakdown 同一個模式。試點範圍刻意只有
// 3 支指標（見 PILOT_PROVENANCE_METRIC_CODES 的說明）——metricCode 用 z.enum 驗證，不支援
// 的指標直接被 zod 擋成 400，不是隱性涵蓋所有指標，吸取 dependsOn 的教訓。symbol 用路徑
// 參數（不是 query），是這支端點跟其餘 /companies/* 端點刻意不同的地方，配合 web-nuxt
// 提議的路徑格式。
export const getCompanyMetricProvenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricProvenanceQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }
    const symbol = req.params.symbol;
    if (!symbol) {
      return res.status(400).json({ message: 'symbol is required.' });
    }

    const { metricCode, year, season } = validationResult.data;
    const result = await PROVENANCE_RESOLVERS[metricCode]({ symbol, year, season, dataType: '2', subsidiaryCompanyId: '' });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

