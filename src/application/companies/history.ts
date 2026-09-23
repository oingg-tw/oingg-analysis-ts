import { ValidationError } from '@/application/errors';
import type { AppDeps } from '@/application/deps';
import { getRoeHistory } from '@/application/metrics/profitability/roe/queryRoeHistory';
import { getRoaHistory } from '@/application/metrics/profitability/roa/queryRoaHistory';
import { getDupontHistory } from '@/application/metrics/shared/dupont/queryDupontHistory';
import { getMetricHistory } from '@/application/metrics/shared/queryMetricHistory';
import { getDailyCadenceMetricHistory } from '@/application/metrics/shared/queryDailyCadenceMetricHistory';
import { getMultiMetricHistory } from '@/application/metrics/shared/queryMultiMetricHistory';
import { resolveTimeframeForMetric } from '@/application/metrics/resolveTimeframeForMetric';
import { BETA_WINDOWS } from '@/domain/metrics/betaWindows';
import type { PeriodType } from '@/domain/metrics/metricBasis';

// 2026-09-17 Phase 4：從 http/modules/companies/companyMetricHistoryController.ts 搬來——歷史查詢改走
// deps 注入，原本 controller 手寫的 `res.status(400).json({ message })` 改成丟 ValidationError（errorHandler
// 對 AppError 產生一模一樣的 `{ message }` body），邏輯逐字不變。

// 查無資料回傳空陣列，不是 404——mops 這批資料目前不是每家公司都有覆蓋，「查無股本異動
// 歷史」是正常情境，不代表這家公司不存在（公司存不存在是 /companies/profile 負責判斷的事）。
export const getCompanyCapitalStockHistory = async (symbol: string, deps: Pick<AppDeps, 'capitalStockHistory'>) => {
  const entries = await deps.capitalStockHistory.getCapitalStockHistory(symbol);
  return { symbol, entries };
};

export interface PeriodHistoryQuery {
  symbol: string;
  periodType: 'Q' | 'TTM';
  limit: number;
}

// 給前端畫「ROE 歷史時序」圖表用——第一支直接讀 metric_values（point-in-time 架構）而不是
// profitability_roe 的對外端點，見 queryRoeHistory.ts 的說明。目前資料
// 覆蓋率極低（只有 spike 手動 backfill 過的少數公司），查無資料回傳 entries: []，不是 404
// 或錯誤——跟 getCompanyCapitalStockHistory 同一種「查無歷史資料是正常情境」的慣例。
export const getCompanyRoeHistory = async ({ symbol, periodType, limit }: PeriodHistoryQuery, deps: Pick<AppDeps, 'metricValueQueries' | 'reportAvailability'>) => {
  const { entries, total, hasMore } = await getRoeHistory(symbol, periodType, limit, deps);
  return { symbol, metricCode: 'roe' as const, periodType, total, hasMore, entries };
};

// 給前端畫「ROA 歷史時序」圖表用，完全比照 getCompanyRoeHistory 的模式（第二支直接讀
// metric_values 的端點）。查無資料回傳 entries: []，不是 404。
export const getCompanyRoaHistory = async ({ symbol, periodType, limit }: PeriodHistoryQuery, deps: Pick<AppDeps, 'metricValueQueries' | 'reportAvailability'>) => {
  const { entries, total, hasMore } = await getRoaHistory(symbol, periodType, limit, deps);
  return { symbol, metricCode: 'roa' as const, periodType, total, hasMore, entries };
};

// 給前端畫「杜邦拆解」圖表用——這批遷移嚴格需要的最小集合（淨利率/總資產週轉率兩個因子 +
// 權益乘數 + 組裝出來的 ROE），不是完整的毛利率/週轉率家族，見 queryDupontHistory.ts 的說明。
// periodType=TTM 時 equityMultiplier 沿用同一期的 Q 快照值（不是恆為 null）。查無資料回傳 entries: []，不是 404。
export const getCompanyDupontHistory = async ({ symbol, periodType, limit }: PeriodHistoryQuery, deps: Pick<AppDeps, 'metricValueQueries' | 'reportAvailability'>) => {
  const { entries, total, hasMore } = await getDupontHistory(symbol, periodType, limit, deps);
  return { symbol, periodType, total, hasMore, entries };
};

export interface MetricHistoryQuery {
  symbol: string;
  metricCode: string;
  timeframe: string;
  limit: number;
}

// 泛化版的單一 metric_code 歷史查詢端點——2026-09-06 point-in-time 架構第三批遷移（10 個
// 新 metric_code）動工前新增，取代「每遷一支指標就在這三個檔案各自複製貼上一段」的模式
// （roe-history/roa-history 就是這樣長出來的）。metricCode/timeframe 都不是寫死的 zod enum，
// 而是動態查 metricDefinitionRegistry——這份 registry 之後會持續成長，沒辦法每次新增指標
// 都回來改一次這裡的型別。roe-history/roa-history/dupont-history 三支既有端點維持不動，
// 這支只是之後新增指標的曝露管道，不是要取代它們。
// 2026-09-14：query 參數 token 改名 timeframe（金融/交易類 API 常見用語），是對外契約變更。
export const getCompanyMetricHistory = async ({ symbol, metricCode, timeframe, limit }: MetricHistoryQuery, deps: Pick<AppDeps, 'metricValueQueries' | 'reportAvailability'>) => {
  // 2026-09-11 使用者要求：beta 不畫河流圖，沒有查詢單一公司歷史/最新值的需求，直接從
  // 這支端點移除——beta 全市場只回填最新一筆快照（不像 exchangePeRatio/exchangePbRatio/
  // dividendYield 那樣有完整歷史），真正需要 beta 的情境是排行/篩選（screener 的
  // "beta.1Y_1D" 欄位），不是查單一公司的歷史時間序列，所以只擋這支端點，不影響 screener。
  if (metricCode === 'beta') {
    throw new ValidationError('beta 不支援 GET /companies/metric-history 查詢，請改用 screener/ranking（field: "beta.1Y_1D" 等）。');
  }

  // 不合法的 metricCode/timeframe 由 resolveTimeframeForMetric 丟 ValidationError → 400 `{ message }`。
  const fieldRef = resolveTimeframeForMetric(metricCode, timeframe, `${metricCode}.${timeframe}`);

  // 2026-09-09：逐日型指標（beta/exchangePeRatio 等）拆表後查的是不同的 Prisma model/
  // 去重邏輯，見 queryDailyCadenceMetricHistory.ts 的說明——依 FieldRef.isDailyCadence
  // 分流，呼叫端（這裡）完全不用知道背後是哪張表。
  const dataType = await deps.reportAvailability.resolveDataType(symbol);
  const { entries, total, hasMore } = fieldRef.isDailyCadence
    ? await getDailyCadenceMetricHistory(symbol, metricCode, { lookbackRange: fieldRef.lookbackRange, samplingInterval: fieldRef.samplingInterval, snapshotCadence: fieldRef.snapshotCadence }, dataType, '', limit, deps)
    : await getMetricHistory(symbol, metricCode, fieldRef.periodType, dataType, '', limit, deps);
  return { symbol, metricCode, timeframe, total, hasMore, entries };
};

export const MAX_METRIC_CODES_PER_REQUEST = 10;

export interface MetricsHistoryQuery {
  symbol: string;
  metricCodes: string; // 逗號分隔的原始字串，這裡才拆（跟以前 controller 一樣，schema 不做 transform）
  timeframe: string;
  limit: number;
}

// 泛化版的「一次抓多個 metric_code」歷史查詢端點——2026-09-07 使用者要「五年三率」（毛利率/
// 營業利益率/淨利率）一次拿齊時新增。跟 dupont-history 不同：dupont-history 是特定家族寫死
// 具名欄位的組合端點；這支是任意 metricCode 清單、用 metricCode 當 key 合併回傳，不要求
// 彼此有語意組裝關係。timeframe 對清單裡每個 metricCode 都要合法，只要有一個不允許就整體回 400
// （附上是哪個 metricCode 不允許），不會部分成功。
export const getCompanyMetricsHistory = async (query: MetricsHistoryQuery, deps: Pick<AppDeps, 'metricValueQueries' | 'reportAvailability'>) => {
  const { symbol, timeframe, limit } = query;
  const metricCodes = [...new Set(query.metricCodes.split(',').map((code) => code.trim()).filter((code) => code.length > 0))];

  if (metricCodes.length === 0) {
    throw new ValidationError('metricCodes 至少要指定一個。');
  }
  if (metricCodes.length > MAX_METRIC_CODES_PER_REQUEST) {
    throw new ValidationError(`metricCodes 最多 ${MAX_METRIC_CODES_PER_REQUEST} 個，收到 ${metricCodes.length} 個。`);
  }

  // 2026-09-09：逐日型指標（beta/exchangePeRatio 等）刻意不支援多指標一次查——沒有
  // 實際情境會把 beta 跟其他 metricCode 混在同一次多指標查詢裡，硬做這個組合的複雜度
  // 換不到實際使用價值，見 abstract-crafting-journal.md 的拆表決策。偵測到任一
  // metricCode 是逐日型就直接 400，附上請改走 metric-history 逐一查詢的訊息。
  let periodType: PeriodType | undefined;
  for (const metricCode of metricCodes) {
    const fieldRef = resolveTimeframeForMetric(metricCode, timeframe, `${metricCode}.${timeframe}`);
    if (fieldRef.isDailyCadence) {
      throw new ValidationError(`metricCode "${metricCode}" 是逐日型指標，metrics-history 目前不支援逐日型指標一次查詢多個，請改用 GET /companies/metric-history 逐一查詢。`);
    }
    periodType ??= fieldRef.periodType;
  }

  const { entries, total, hasMore } = await getMultiMetricHistory(symbol, metricCodes, periodType!, await deps.reportAvailability.resolveDataType(symbol), '', limit, deps);
  return { symbol, metricCodes, timeframe, total, hasMore, entries };
};

// 月營收歷史——上市＋上櫃全市場，2021-09 起逐月共 60 個月（上市 993 家、上櫃 894 家，2026-09-23 兩邊
// 都完成回填；之後每月自動 ingest）。2026-09-23 之前這裡只有 2330 回得出資料，原因是讀錯資料庫，見
// infrastructure/repositories/twse/monthlyRevenue.ts 的說明。查無資料會正確回 entries: []（不是 404），
// 跟 getCompanyCapitalStockHistory 同一種「查無歷史資料是正常情境」的慣例。
export const getCompanyMonthlyRevenueHistory = async ({ symbol, limit }: { symbol: string; limit: number }, deps: Pick<AppDeps, 'monthlyRevenue'>) => {
  const { entries, total, hasMore } = await deps.monthlyRevenue.getMonthlyRevenueHistory(symbol, limit);
  return { symbol, total, hasMore, entries };
};

// 2026-09-14 web-nuxt 轉達使用者需求：股票詳情頁 Beta 卡片要直接顯示係數數值。GET /companies/metric-history
// 對 metricCode='beta' 一律 400（畫圖用的歷史查詢），這支是「查單一公司目前的係數值」的輕量快照端點，
// 一次回傳 BETA_WINDOWS 四個滾動視窗各自最新一筆，不做歷史累積。
export const getCompanyBeta = async (symbol: string, deps: Pick<AppDeps, 'metricValueQueries' | 'reportAvailability'>) => {
  const dataType = await deps.reportAvailability.resolveDataType(symbol);
  const windows = await Promise.all(
    BETA_WINDOWS.map(async ({ timeframe, lookbackRange, samplingInterval }) => {
      const { entries } = await getDailyCadenceMetricHistory(symbol, 'beta', { lookbackRange, samplingInterval, snapshotCadence: 'N/A' }, dataType, '', 1, deps);
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

  return { symbol, metricCode: 'beta' as const, windows };
};
