import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getCapitalStockHistory } from '@/models/mops/capitalStock';
import { getRoeHistory } from '@/domainPitMetrics/profitability/roe/queryRoeHistory';
import { getRoaHistory } from '@/domainPitMetrics/profitability/roa/queryRoaHistory';
import { getDupontHistory } from '@/domainPitMetrics/shared/dupont/queryDupontHistory';
import { getMetricHistory } from '@/domainPitMetrics/shared/queryMetricHistory';
import { getDailyCadenceMetricHistory } from '@/domainPitMetrics/shared/queryDailyCadenceMetricHistory';
import { getMultiMetricHistory } from '@/domainPitMetrics/shared/queryMultiMetricHistory';
import { getMonthlyRevenueHistory } from '@/models/twse/monthlyRevenue';
import { resolveTimeframeForMetric, ScreenerValidationError } from '@/api/bff/screener/fieldResolver';
import type { PeriodType, LookbackRange, SamplingInterval } from '@/domainPitMetrics/metricBasis';

// 查無資料回傳空陣列，不是 404——mops 這批資料目前不是每家公司都有覆蓋，「查無股本異動
// 歷史」是正常情境，不代表這家公司不存在（公司存不存在是 /companies/profile 負責判斷的事）。
export const getCompanyCapitalStockHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
});

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
const ROE_HISTORY_PERIOD_TYPE_VALUES = ['Q', 'TTM'] as const;
const MAX_ROE_HISTORY_LIMIT = 40; // 10 年份季度資料，畫圖情境不需要更多

export const getCompanyRoeHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  periodType: z.enum(ROE_HISTORY_PERIOD_TYPE_VALUES).default('TTM').meta({ description: '單季(Q)/近四季(TTM)，預設 TTM' }),
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
const ROA_HISTORY_PERIOD_TYPE_VALUES = ['Q', 'TTM'] as const;
const MAX_ROA_HISTORY_LIMIT = 40;

export const getCompanyRoaHistoryQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  periodType: z.enum(ROA_HISTORY_PERIOD_TYPE_VALUES).default('TTM').meta({ description: '單季(Q)/近四季(TTM)，預設 TTM' }),
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
// equityMultiplier 沿用同一期的 Q 快照值（不是恆為 null，見 queryDupontHistory.ts 的說明）。
// 查無資料回傳 entries: []，不是 404。
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
  timeframe: z
    .string({ error: 'timeframe is required.' })
    .min(1)
    .meta({ description: "'Q'/'YTD'/'TTM'/'FY' 之一（季報型），或 '<lookbackRange>_<samplingInterval>'（滾動統計量，例如 '2Y_1W'），或 'EOD'（市場快照）——實際允許哪些由 metricCode 決定，不符合會回 400，可用組合見 GET /metrics" }),
  limit: z.coerce.number().int().min(1).max(MAX_METRIC_HISTORY_LIMIT).default(20).meta({ description: `取最近幾期，預設 20（約 5 年季度資料），上限 ${MAX_METRIC_HISTORY_LIMIT}。` }),
});

// 泛化版的單一 metric_code 歷史查詢端點——2026-09-06 point-in-time 架構第三批遷移（10 個
// 新 metric_code）動工前新增，取代「每遷一支指標就在這三個檔案各自複製貼上一段」的模式
// （roe-history/roa-history 就是這樣長出來的）。metricCode/timeframe 都不是寫死的 zod enum，
// 而是動態查 metricDefinitionRegistry——這份 registry 之後會持續成長，沒辦法每次新增指標
// 都回來改一次這裡的型別。roe-history/roa-history/dupont-history 三支既有端點維持不動，
// 這支只是之後新增指標的曝露管道，不是要取代它們（dupont-history 是真正的多 metric_code
// 組合，泛化不適用；另外兩支沒有壞掉，不用強行改掉可能已經在用的呼叫端）。
// 2026-09-08：query 參數原本叫 basis（單一字串直接對應 metric_values.basis 欄位），改名
// token 並改用 resolveTokenForMetric（跟 screener/fieldResolver.ts 的 "metricCode.token"
// 解析共用同一套四組判斷邏輯）——這是「metric_values.basis 拆成四個精準命名欄位」重構
// 的一部分，basis 這個字本身違反 ubiquitous language，見 abstract-crafting-journal.md。
// 2026-09-14：token 再改名 timeframe（resolveTokenForMetric -> resolveTimeframeForMetric）——
// token 一樣是「隨便一個識別字串」的空洞用詞，沒有傳達「這是在挑時間切法」的領域語意，
// timeframe 是金融/交易類 API 常見用語（K 線圖 1D/1W/1M 就叫 timeframe），三種指標形狀
// （period/rollingWindow/snapshot）都套得上去。這是對外 API 契約變更（query 參數
// token= 改成 timeframe=），bff-ts 內部 basis->token 的轉換要同步改成 basis->timeframe。
export const getCompanyMetricHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, metricCode, timeframe, limit } = validationResult.data;

    // 2026-09-11 使用者要求：beta 不畫河流圖，沒有查詢單一公司歷史/最新值的需求，直接從
    // 這支端點移除——beta 全市場只回填最新一筆快照（不像 exchangePeRatio/exchangePbRatio/
    // dividendYield 那樣有完整歷史），真正需要 beta 的情境是排行/篩選（screener 的
    // "beta.1Y_1D" 欄位），不是查單一公司的歷史時間序列，所以只擋這支端點，不影響 screener。
    if (metricCode === 'beta') {
      return res.status(400).json({ message: 'beta 不支援 GET /companies/metric-history 查詢，請改用 screener/ranking（field: "beta.1Y_1D" 等）。' });
    }

    let fieldRef;
    try {
      fieldRef = resolveTimeframeForMetric(metricCode, timeframe, `${metricCode}.${timeframe}`);
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
    res.status(200).json({ symbol, metricCode, timeframe, total, hasMore, entries });
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
  timeframe: z
    .string({ error: 'timeframe is required.' })
    .min(1)
    .meta({ description: "'Q'/'YTD'/'TTM'/'FY' 之一（季報型），或 '<lookbackRange>_<samplingInterval>'（滾動統計量），或 'EOD'（市場快照），套用到清單裡的每個 metricCode，任一個不允許就整體回 400，可用組合見 GET /metrics" }),
  limit: z.coerce.number().int().min(1).max(MAX_METRIC_HISTORY_LIMIT).default(20).meta({ description: `取最近幾期，預設 20（約 5 年季度資料），上限 ${MAX_METRIC_HISTORY_LIMIT}。` }),
});

// 泛化版的「一次抓多個 metric_code」歷史查詢端點——2026-09-07 使用者要「五年三率」（毛利率/
// 營業利益率/淨利率）一次拿齊時新增。跟 dupont-history 不同：dupont-history 是特定家族寫死
// 具名欄位的組合端點；這支是任意 metricCode 清單、用 metricCode 當 key 合併回傳，不要求
// 彼此有語意組裝關係。timeframe 對清單裡每個 metricCode 都要合法，只要有一個不允許就整體回 400
// （附上是哪個 metricCode 不允許），不會部分成功。
// 2026-09-08：query 參數原本叫 basis，改名 token；2026-09-14 再改名 timeframe（理由同
// getCompanyMetricHistory 上方註解）。
export const getCompanyMetricsHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyMetricsHistoryQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol, timeframe, limit } = validationResult.data;
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
        fieldRef = resolveTimeframeForMetric(metricCode, timeframe, `${metricCode}.${timeframe}`);
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
    res.status(200).json({ symbol, metricCodes, timeframe, total, hasMore, entries });
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

// 2026-09-14 web-nuxt 轉達使用者需求：股票詳情頁 Beta 卡片要直接顯示係數數值，不只是
// 對照走勢圖。GET /companies/metric-history 對 metricCode='beta' 一律 400（2026-09-11
// 的既有決定，理由是 beta 沒有真正的歷史時間序列可畫河流圖），但那個決定針對的是「畫圖用
// 的歷史查詢」，不涵蓋「查單一公司目前的係數值」這個不同情境——後者用 screener/ranking
// 查一個 symbol 是殺雞用牛刀（那是給篩選/排名情境設計的端點），所以另開這支輕量的單一
// 公司快照端點，一次回傳三個滾動視窗（1Y_1D/2Y_1W/5Y_1M）各自最新一筆，不做歷史累積。
const BETA_WINDOWS: { timeframe: string; lookbackRange: LookbackRange; samplingInterval: SamplingInterval }[] = [
  { timeframe: '1Y_1D', lookbackRange: '1Y', samplingInterval: '1D' },
  { timeframe: '2Y_1W', lookbackRange: '2Y', samplingInterval: '1W' },
  { timeframe: '5Y_1M', lookbackRange: '5Y', samplingInterval: '1M' },
];

export const getCompanyBetaQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
});

export const getCompanyBeta = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getCompanyBetaQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const { symbol } = validationResult.data;
    const windows = await Promise.all(
      BETA_WINDOWS.map(async ({ timeframe, lookbackRange, samplingInterval }) => {
        const { entries } = await getDailyCadenceMetricHistory(symbol, 'beta', { lookbackRange, samplingInterval, snapshotCadence: 'N/A' }, '2', '', 1);
        const latest = entries.at(-1) ?? null;
        return {
          timeframe,
          value: latest?.value ?? null,
          nullReason: latest?.nullReason ?? null,
          tradeDate: latest?.tradeDate ?? null,
          knowledgeDate: latest?.knowledgeDate ?? null,
          knowledgeDateIsFallback: latest?.knowledgeDateIsFallback ?? null,
        };
      })
    );

    res.status(200).json({ symbol, metricCode: 'beta', windows });
  } catch (error) {
    next(error);
  }
};
