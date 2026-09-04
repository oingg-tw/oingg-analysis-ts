import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolvePriceSeries } from '@/shared/sourceData/priceSeries';
import { hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { simpleMovingAverage } from '@/shared/technicalMath';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { MaQuery, MaResult, MaWindowValue } from './types';
import { logger } from '@/shared/logger';

const WINDOWS = [5, 10, 20, 60, 120, 200] as const;
type WindowKey = 'ma5d' | 'ma10d' | 'ma20d' | 'ma60d' | 'ma120d' | 'ma200d';
const WINDOW_KEYS: Record<(typeof WINDOWS)[number], WindowKey> = { 5: 'ma5d', 10: 'ma10d', 20: 'ma20d', 60: 'ma60d', 120: 'ma120d', 200: 'ma200d' };

export const calculateMa = async (query: MaQuery): Promise<MaResult> => {
  const { symbol, asOfDate } = query;
  const warnings: string[] = [];

  const emptyWindow = (window: number): MaWindowValue => ({ value: null, window });

  const { series, effectiveAsOf, fellBackFromRequestedDate } = await resolvePriceSeries(symbol, asOfDate);
  if (fellBackFromRequestedDate) {
    warnings.push(`指定日期 ${asOfDate} 不是交易日或還沒有資料，改用往前最近的交易日 ${effectiveAsOf}。`);
  }

  if (series.length === 0) {
    const covered = await hasStockPriceCoverage(symbol);
    const status: MetricStatus = covered
      ? { status: 'no_data', message: '查無股價資料。' }
      : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };
    warnings.push(covered ? `${symbol} 查無股價資料，無法計算移動平均線。` : `${symbol} 不在 daily_price 覆蓋範圍內，無法計算移動平均線。`);
    return {
      symbol,
      asOfDate: null,
      ma5d: emptyWindow(5),
      ma10d: emptyWindow(10),
      ma20d: emptyWindow(20),
      ma60d: emptyWindow(60),
      ma120d: emptyWindow(120),
      ma200d: emptyWindow(200),
      dataCoverage: { tradingDays: 0, earliestDate: null },
      fieldStatuses: buildFieldStatuses(WINDOWS.map((w) => [WINDOW_KEYS[w], status] as [string, MetricStatus])),
      warnings,
    };
  }

  const closes = series.map((p) => p.close).filter((c): c is number => c !== null);

  const values: Record<WindowKey, number | null> = {} as Record<WindowKey, number | null>;
  for (const window of WINDOWS) {
    values[WINDOW_KEYS[window]] = simpleMovingAverage(closes, window);
  }

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = WINDOWS.map((window) => {
    const key = WINDOW_KEYS[window];
    if (values[key] !== null) return null;
    return [key, { status: 'no_data', message: `資料只有 ${closes.length} 個交易日的收盤價，少於 ${window} 天視窗，暫時無法計算，之後資料累積足夠會自動算出來。` }];
  });

  // 存進 oingg-analysis DB 的 technicals_ma，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.maResult.upsert({
      where: { symbol_tradeDate: { symbol: symbol, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`) } },
      create: {
        symbol: symbol,
        tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`),
        ma5d: values.ma5d,
        ma10d: values.ma10d,
        ma20d: values.ma20d,
        ma60d: values.ma60d,
        ma120d: values.ma120d,
        ma200d: values.ma200d,
        warnings,
      },
      update: {
        ma5d: values.ma5d,
        ma10d: values.ma10d,
        ma20d: values.ma20d,
        ma60d: values.ma60d,
        ma120d: values.ma120d,
        ma200d: values.ma200d,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[ma]: 寫入 technicals_ma 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    asOfDate: effectiveAsOf,
    ma5d: { value: values.ma5d, window: 5 },
    ma10d: { value: values.ma10d, window: 10 },
    ma20d: { value: values.ma20d, window: 20 },
    ma60d: { value: values.ma60d, window: 60 },
    ma120d: { value: values.ma120d, window: 120 },
    ma200d: { value: values.ma200d, window: 200 },
    dataCoverage: { tradingDays: closes.length, earliestDate: series[0]!.tradeDate },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
