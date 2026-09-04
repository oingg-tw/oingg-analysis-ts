import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolvePriceSeries } from '@/shared/sourceData/priceSeries';
import { hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { wilderRsi } from '@/shared/technicalMath';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { RsiQuery, RsiResult, RsiWindowValue } from './types';
import { logger } from '@/shared/logger';

const WINDOWS = [6, 14, 24] as const;
type WindowKey = 'rsi6d' | 'rsi14d' | 'rsi24d';
const WINDOW_KEYS: Record<(typeof WINDOWS)[number], WindowKey> = { 6: 'rsi6d', 14: 'rsi14d', 24: 'rsi24d' };

export const calculateRsi = async (query: RsiQuery): Promise<RsiResult> => {
  const { symbol, asOfDate } = query;
  const warnings: string[] = [];

  const emptyWindow = (window: number): RsiWindowValue => ({ value: null, window });

  const { series, effectiveAsOf, fellBackFromRequestedDate } = await resolvePriceSeries(symbol, asOfDate);
  if (fellBackFromRequestedDate) {
    warnings.push(`指定日期 ${asOfDate} 不是交易日或還沒有資料，改用往前最近的交易日 ${effectiveAsOf}。`);
  }

  if (series.length === 0) {
    const covered = await hasStockPriceCoverage(symbol);
    const status: MetricStatus = covered
      ? { status: 'no_data', message: '查無股價資料。' }
      : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };
    warnings.push(covered ? `${symbol} 查無股價資料，無法計算 RSI。` : `${symbol} 不在 daily_price 覆蓋範圍內，無法計算 RSI。`);
    return {
      symbol,
      asOfDate: null,
      rsi6d: emptyWindow(6),
      rsi14d: emptyWindow(14),
      rsi24d: emptyWindow(24),
      dataCoverage: { tradingDays: 0, earliestDate: null },
      fieldStatuses: buildFieldStatuses(WINDOWS.map((w) => [WINDOW_KEYS[w], status] as [string, MetricStatus])),
      warnings,
    };
  }

  const closes = series.map((p) => p.close).filter((c): c is number => c !== null);

  const values: Record<WindowKey, number | null> = {} as Record<WindowKey, number | null>;
  for (const window of WINDOWS) values[WINDOW_KEYS[window]] = wilderRsi(closes, window);

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = WINDOWS.map((window) => {
    const key = WINDOW_KEYS[window];
    if (values[key] !== null) return null;
    return [
      key,
      { status: 'no_data', message: `資料只有 ${closes.length} 個交易日的收盤價，少於 RSI(${window}) 需要的 ${window + 1} 天，暫時無法計算，之後資料累積足夠會自動算出來。` },
    ];
  });

  try {
    await analysisPrisma.rsiResult.upsert({
      where: { symbol_tradeDate: { symbol: symbol, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`) } },
      create: { symbol: symbol, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`), rsi6d: values.rsi6d, rsi14d: values.rsi14d, rsi24d: values.rsi24d, warnings },
      update: { rsi6d: values.rsi6d, rsi14d: values.rsi14d, rsi24d: values.rsi24d, warnings },
    });
  } catch (error) {
    logger.error({ err: error }, '[rsi]: 寫入 technicals_rsi 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    asOfDate: effectiveAsOf,
    rsi6d: { value: values.rsi6d, window: 6 },
    rsi14d: { value: values.rsi14d, window: 14 },
    rsi24d: { value: values.rsi24d, window: 24 },
    dataCoverage: { tradingDays: closes.length, earliestDate: series[0]!.tradeDate },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
