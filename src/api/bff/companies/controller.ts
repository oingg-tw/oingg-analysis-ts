import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { listAllCompanyNames, countAllCompanyNames, getCompanyProfileDetail, getCompanyNamesForSymbols, getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';
import { getCapitalStockHistory } from '@/shared/sourceData/capitalStock';
import { getRoeHistory } from '@/pitMetrics/profitability/roe/queryRoeHistory';
import { getRoaHistory } from '@/pitMetrics/profitability/roa/queryRoaHistory';
import { getDupontHistory } from '@/pitMetrics/shared/dupont/queryDupontHistory';
import { getMetricHistory } from '@/pitMetrics/queryMetricHistory';
import { getMultiMetricHistory } from '@/pitMetrics/queryMultiMetricHistory';
import { getMonthlyRevenueHistory } from '@/shared/sourceData/monthlyRevenue';
import { metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { findPeerGroup } from '@/shared/sourceData/industryClassification';
import { getLatestAvailableQuarter, type StatementSource } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyCashFlowStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getBalanceSheetXbrlFull } from '@/shared/sourceData/balanceSheetXbrlFull';
import { getIncomeStatementXbrlFull } from '@/shared/sourceData/incomeStatementXbrlFull';
import { getXbrlCashFlowQuarterly } from '@/shared/sourceData/xbrlCashFlowQuarterly';
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
// profitability_roe 的對外端點，見 src/pitMetrics/profitability/roe/queryRoeHistory.ts 的說明。目前資料
// 覆蓋率極低（只有 spike 手動 backfill 過的少數公司），查無資料回傳 entries: []，不是 404
// 或錯誤——跟 getCompanyCapitalStockHistory 同一種「查無歷史資料是正常情境」的慣例。
export const getCompanyRoeHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyRoeHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, basis, limit } = validationResult.data;
    const { entries, total, hasMore } = await getRoeHistory(symbol, basis, limit);
    res.status(200).json({ symbol, metricCode: 'roe', basis, total, hasMore, entries });
  } catch (error) {
    next(error);
  }
};

// ROA 這支指標目前允許的 basis 跟 ROE 一模一樣（見
// src/pitMetrics/metricDefinitionRegistry.ts 的 metricDefinitionRegistry.roa.allowedBases）。
const ROA_HISTORY_BASIS_VALUES = ['Q', 'Q_ANN', 'TTM'] as const;
const MAX_ROA_HISTORY_LIMIT = 40;

export const getCompanyRoaHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  basis: z.enum(ROA_HISTORY_BASIS_VALUES).default('TTM').meta({ description: '單季(Q)/單季簡易年化(Q_ANN)/近四季(TTM)，預設 TTM' }),
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

    const { symbol, basis, limit } = validationResult.data;
    const { entries, total, hasMore } = await getRoaHistory(symbol, basis, limit);
    res.status(200).json({ symbol, metricCode: 'roa', basis, total, hasMore, entries });
  } catch (error) {
    next(error);
  }
};

// Dupont 拆解沒有 Q_ANN——dupontDecomposedRoe/equityMultiplier 都沒有這個變體（見
// src/pitMetrics/metricDefinitionRegistry.ts 的 metricDefinitionRegistry.dupontDecomposedRoe/
// equityMultiplier.allowedBases）。
const DUPONT_HISTORY_BASIS_VALUES = ['Q', 'TTM'] as const;
const MAX_DUPONT_HISTORY_LIMIT = 40;

export const getCompanyDupontHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  basis: z.enum(DUPONT_HISTORY_BASIS_VALUES).default('Q').meta({ description: '單季(Q)/近四季(TTM)，預設 Q' }),
  limit: z.coerce.number().int().min(1).max(MAX_DUPONT_HISTORY_LIMIT).default(20).meta({ description: '取最近幾期，預設 20（約 5 年季度資料），上限 40。' }),
});

// 給前端畫「杜邦拆解」圖表用——這批遷移嚴格需要的最小集合（淨利率/總資產週轉率兩個因子 +
// 權益乘數 + 組裝出來的 ROE），不是完整的毛利率/週轉率家族，見
// src/pitMetrics/shared/dupont/queryDupontHistory.ts 的說明。basis=TTM 時 equityMultiplier 恆為
// null。查無資料回傳 entries: []，不是 404。
export const getCompanyDupontHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyDupontHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, basis, limit } = validationResult.data;
    const { entries, total, hasMore } = await getDupontHistory(symbol, basis, limit);
    res.status(200).json({ symbol, basis, total, hasMore, entries });
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
  basis: z.string({ error: 'basis is required.' }).min(1).meta({ description: "'Q'/'Q_ANN'/'TTM'/'CUM'/'FY' 之一，實際允許哪些由 metricCode 決定，不符合會回 400" }),
  limit: z.coerce.number().int().min(1).max(MAX_METRIC_HISTORY_LIMIT).default(20).meta({ description: `取最近幾期，預設 20（約 5 年季度資料），上限 ${MAX_METRIC_HISTORY_LIMIT}。` }),
});

// 泛化版的單一 metric_code 歷史查詢端點——2026-09-06 point-in-time 架構第三批遷移（10 個
// 新 metric_code）動工前新增，取代「每遷一支指標就在這三個檔案各自複製貼上一段」的模式
// （roe-history/roa-history 就是這樣長出來的）。metricCode/basis 都不是寫死的 zod enum，
// 而是動態查 metricDefinitionRegistry——這份 registry 之後會持續成長，沒辦法每次新增指標
// 都回來改一次這裡的型別。roe-history/roa-history/dupont-history 三支既有端點維持不動，
// 這支只是之後新增指標的曝露管道，不是要取代它們（dupont-history 是真正的多 metric_code
// 組合，泛化不適用；另外兩支沒有壞掉，不用強行改掉可能已經在用的呼叫端）。
export const getCompanyMetricHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, metricCode, basis, limit } = validationResult.data;
    const definition = metricDefinitionRegistry[metricCode];
    if (!definition) {
      return res.status(400).json({ message: `未知的 metricCode "${metricCode}"。` });
    }
    if (!definition.allowedBases.includes(basis as (typeof definition.allowedBases)[number])) {
      return res.status(400).json({ message: `metricCode "${metricCode}" 不允許 basis "${basis}"，允許的值：${definition.allowedBases.join(', ')}。` });
    }

    const { entries, total, hasMore } = await getMetricHistory(symbol, metricCode, basis as (typeof definition.allowedBases)[number], '2', '', limit);
    res.status(200).json({ symbol, metricCode, basis, total, hasMore, entries });
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
  basis: z.string({ error: 'basis is required.' }).min(1).meta({ description: "'Q'/'Q_ANN'/'TTM'/'CUM'/'FY' 之一，套用到清單裡的每個 metricCode，任一個不允許就整體回 400" }),
  limit: z.coerce.number().int().min(1).max(MAX_METRIC_HISTORY_LIMIT).default(20).meta({ description: `取最近幾期，預設 20（約 5 年季度資料），上限 ${MAX_METRIC_HISTORY_LIMIT}。` }),
});

// 泛化版的「一次抓多個 metric_code」歷史查詢端點——2026-09-07 使用者要「五年三率」（毛利率/
// 營業利益率/淨利率）一次拿齊時新增。跟 dupont-history 不同：dupont-history 是特定家族寫死
// 具名欄位的組合端點；這支是任意 metricCode 清單、用 metricCode 當 key 合併回傳，不要求
// 彼此有語意組裝關係。basis 對清單裡每個 metricCode 都要合法，只要有一個不允許就整體回 400
// （附上是哪個 metricCode 不允許），不會部分成功。
export const getCompanyMetricsHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricsHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, basis, limit } = validationResult.data;
    const metricCodes = [...new Set(validationResult.data.metricCodes.split(',').map((code) => code.trim()).filter((code) => code.length > 0))];

    if (metricCodes.length === 0) {
      return res.status(400).json({ message: 'metricCodes 至少要指定一個。' });
    }
    if (metricCodes.length > MAX_METRIC_CODES_PER_REQUEST) {
      return res.status(400).json({ message: `metricCodes 最多 ${MAX_METRIC_CODES_PER_REQUEST} 個，收到 ${metricCodes.length} 個。` });
    }

    for (const metricCode of metricCodes) {
      const definition = metricDefinitionRegistry[metricCode];
      if (!definition) {
        return res.status(400).json({ message: `未知的 metricCode "${metricCode}"。` });
      }
      if (!definition.allowedBases.includes(basis as (typeof definition.allowedBases)[number])) {
        return res.status(400).json({ message: `metricCode "${metricCode}" 不允許 basis "${basis}"，允許的值：${definition.allowedBases.join(', ')}。` });
      }
    }

    const { entries, total, hasMore } = await getMultiMetricHistory(symbol, metricCodes, basis as never, '2', '', limit);
    res.status(200).json({ symbol, metricCodes, basis, total, hasMore, entries });
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
// 把 accounts 攤平成跟 balanceSheet/incomeStatement 一致的扁平物件形狀，完全查無資料時
// fallback 舊三大表（camelCase）。
const getCashFlowStatementXbrlFull = async (key: {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}): Promise<FinancialStatementRow | null> => {
  const xbrl = await getXbrlCashFlowQuarterly(key);
  if (xbrl) return { reportDate: xbrl.reportDate, ...xbrl.accounts };
  return getQuarterlyCashFlowStatement(key);
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
// 的 paidInCapital 那批欄位同一個慣例。eps/epsDiluted 這兩個損益表欄位在查詢層已經是
// string | null（見 mopsQuarterlyStatements.ts 的 toDecimalString），原樣透傳。
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
// 需要再逐一（或依需要批次）查實際指標數值。2026-09-08 filterCatalog/screener 整套機制
// 隨同已無真實依賴的舊架構一起退場後，本服務**沒有任何「多公司 x 多指標一次查值」的批次
// 端點**——GET /companies/metric-history、GET /companies/metrics-history 都是單一 symbol
// 查詢，呼叫端要組出同業比較表需要對每個 peer symbol 各自呼叫一次。這是刻意的能力縮減，
// 不是遺漏；如果之後真的需要批次查值能力，要在 pitMetrics 架構下重新設計（舊的
// screener/values 是靠已退場的 metricTableRegistry 解析出資料表，不能直接復原）。用動態
// 層級回退（子類→細類→小類→中類）找同業，見 src/shared/sourceData/industryClassification.ts
// 的說明。
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

