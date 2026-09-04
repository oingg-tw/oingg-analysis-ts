import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolvePriceSeries } from '@/shared/sourceData/priceSeries';
import { hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { averageTrueRange } from '@/shared/technicalMath';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { AtrQuery, AtrResult, AtrWindowValue } from './types';

const WINDOWS = [14, 20] as const;
type WindowKey = 'atr14d' | 'atr20d';
const WINDOW_KEYS: Record<(typeof WINDOWS)[number], WindowKey> = { 14: 'atr14d', 20: 'atr20d' };

export const calculateAtr = async (query: AtrQuery): Promise<AtrResult> => {
  const { symbol, asOfDate } = query;
  const warnings: string[] = [];

  const emptyWindow = (window: number): AtrWindowValue => ({ value: null, window });

  const { series, effectiveAsOf, fellBackFromRequestedDate } = await resolvePriceSeries(symbol, asOfDate);
  if (fellBackFromRequestedDate) {
    warnings.push(`指定日期 ${asOfDate} 不是交易日或還沒有資料，改用往前最近的交易日 ${effectiveAsOf}。`);
  }

  if (series.length === 0) {
    const covered = await hasStockPriceCoverage(symbol);
    const status: MetricStatus = covered
      ? { status: 'no_data', message: '查無股價資料。' }
      : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };
    warnings.push(covered ? `${symbol} 查無股價資料，無法計算 ATR。` : `${symbol} 不在 daily_price 覆蓋範圍內，無法計算 ATR。`);
    return {
      symbol,
      asOfDate: null,
      atr14d: emptyWindow(14),
      atr20d: emptyWindow(20),
      dataCoverage: { tradingDays: 0, earliestDate: null },
      fieldStatuses: buildFieldStatuses(WINDOWS.map((w) => [WINDOW_KEYS[w], status] as [string, MetricStatus])),
      warnings,
    };
  }

  const highs = series.map((p) => p.high).filter((v): v is number => v !== null);
  const lows = series.map((p) => p.low).filter((v): v is number => v !== null);
  const closes = series.map((p) => p.close).filter((v): v is number => v !== null);

  const values: Record<WindowKey, number | null> = {} as Record<WindowKey, number | null>;
  for (const window of WINDOWS) values[WINDOW_KEYS[window]] = averageTrueRange(highs, lows, closes, window);

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = WINDOWS.map((window) => {
    const key = WINDOW_KEYS[window];
    if (values[key] !== null) return null;
    return [
      key,
      { status: 'no_data', message: `資料只有 ${closes.length} 個交易日，少於 ATR(${window}) 需要的 ${window + 1} 天，暫時無法計算，之後資料累積足夠會自動算出來。` },
    ];
  });

  try {
    await analysisPrisma.atrResult.upsert({
      where: { symbol_tradeDate: { symbol: symbol, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`) } },
      create: { symbol: symbol, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`), atr14d: values.atr14d, atr20d: values.atr20d, warnings },
      update: { atr14d: values.atr14d, atr20d: values.atr20d, warnings },
    });
  } catch (error) {
    console.error('[atr]: 寫入 technicals_atr 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    asOfDate: effectiveAsOf,
    atr14d: { value: values.atr14d, window: 14 },
    atr20d: { value: values.atr20d, window: 20 },
    dataCoverage: { tradingDays: closes.length, earliestDate: series[0]!.tradeDate },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
