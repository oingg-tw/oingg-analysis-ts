import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolvePriceSeries } from '@/shared/priceSeries';
import { hasStockPriceCoverage } from '@/shared/marketCap';
import { simpleMovingAverage, bias as calculateBias } from '@/shared/technicalMath';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { BiasQuery, BiasResult, BiasWindowValue } from './types';

const WINDOWS = [5, 20, 60] as const;
type WindowKey = 'bias5d' | 'bias20d' | 'bias60d';
const WINDOW_KEYS: Record<(typeof WINDOWS)[number], WindowKey> = { 5: 'bias5d', 20: 'bias20d', 60: 'bias60d' };

export const calculateBiasIndicator = async (query: BiasQuery): Promise<BiasResult> => {
  const { companyId, asOfDate } = query;
  const warnings: string[] = [];

  const emptyWindow = (window: number): BiasWindowValue => ({ value: null, window });

  const { series, effectiveAsOf, fellBackFromRequestedDate } = await resolvePriceSeries(companyId, asOfDate);
  if (fellBackFromRequestedDate) {
    warnings.push(`指定日期 ${asOfDate} 不是交易日或還沒有資料，改用往前最近的交易日 ${effectiveAsOf}。`);
  }

  if (series.length === 0) {
    const covered = await hasStockPriceCoverage(companyId);
    const status: MetricStatus = covered
      ? { status: 'no_data', message: '查無股價資料。' }
      : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };
    warnings.push(covered ? `${companyId} 查無股價資料，無法計算乖離率。` : `${companyId} 不在 daily_price 覆蓋範圍內，無法計算乖離率。`);
    return {
      companyId,
      asOfDate: null,
      bias5d: emptyWindow(5),
      bias20d: emptyWindow(20),
      bias60d: emptyWindow(60),
      dataCoverage: { tradingDays: 0, earliestDate: null },
      fieldStatuses: buildFieldStatuses(WINDOWS.map((w) => [WINDOW_KEYS[w], status] as [string, MetricStatus])),
      warnings,
    };
  }

  const closes = series.map((p) => p.close).filter((c): c is number => c !== null);
  const latestClose = closes[closes.length - 1]!;

  const values: Record<WindowKey, number | null> = {} as Record<WindowKey, number | null>;
  for (const window of WINDOWS) {
    const ma = simpleMovingAverage(closes, window);
    values[WINDOW_KEYS[window]] = ma !== null ? calculateBias(latestClose, ma) : null;
  }

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = WINDOWS.map((window) => {
    const key = WINDOW_KEYS[window];
    if (values[key] !== null) return null;
    return [key, { status: 'no_data', message: `資料只有 ${closes.length} 個交易日，少於 ${window} 天視窗，暫時無法計算 MA 也就算不出乖離率，之後資料累積足夠會自動算出來。` }];
  });

  try {
    await analysisPrisma.biasResult.upsert({
      where: { symbol_tradeDate: { symbol: companyId, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`) } },
      create: { symbol: companyId, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`), bias5d: values.bias5d, bias20d: values.bias20d, bias60d: values.bias60d, warnings },
      update: { bias5d: values.bias5d, bias20d: values.bias20d, bias60d: values.bias60d, warnings },
    });
  } catch (error) {
    console.error('[bias]: 寫入 technicals_bias 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    asOfDate: effectiveAsOf,
    bias5d: { value: values.bias5d, window: 5 },
    bias20d: { value: values.bias20d, window: 20 },
    bias60d: { value: values.bias60d, window: 60 },
    dataCoverage: { tradingDays: closes.length, earliestDate: series[0]!.tradeDate },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
