import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolvePriceSeries } from '@/shared/sourceData/priceSeries';
import { hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { stochasticKD } from '@/shared/technicalMath';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { KdQuery, KdResult, KdWindowValue } from './types';

const WINDOWS = [9, 14] as const;

export const calculateKd = async (query: KdQuery): Promise<KdResult> => {
  const { symbol, asOfDate } = query;
  const warnings: string[] = [];

  const emptyWindow = (window: number): KdWindowValue => ({ value: null, window });

  const { series, effectiveAsOf, fellBackFromRequestedDate } = await resolvePriceSeries(symbol, asOfDate);
  if (fellBackFromRequestedDate) {
    warnings.push(`指定日期 ${asOfDate} 不是交易日或還沒有資料，改用往前最近的交易日 ${effectiveAsOf}。`);
  }

  if (series.length === 0) {
    const covered = await hasStockPriceCoverage(symbol);
    const status: MetricStatus = covered
      ? { status: 'no_data', message: '查無股價資料。' }
      : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };
    warnings.push(covered ? `${symbol} 查無股價資料，無法計算 KD。` : `${symbol} 不在 daily_price 覆蓋範圍內，無法計算 KD。`);
    return {
      symbol,
      asOfDate: null,
      k9d: emptyWindow(9),
      d9d: emptyWindow(9),
      k14d: emptyWindow(14),
      d14d: emptyWindow(14),
      dataCoverage: { tradingDays: 0, earliestDate: null },
      fieldStatuses: buildFieldStatuses([
        ['k9d', status],
        ['d9d', status],
        ['k14d', status],
        ['d14d', status],
      ]),
      warnings,
    };
  }

  const highs = series.map((p) => p.high).filter((v): v is number => v !== null);
  const lows = series.map((p) => p.low).filter((v): v is number => v !== null);
  const closes = series.map((p) => p.close).filter((v): v is number => v !== null);

  const kd9 = stochasticKD(highs, lows, closes, 9);
  const kd14 = stochasticKD(highs, lows, closes, 14);

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    kd9 === null
      ? ['k9d', { status: 'no_data', message: `資料只有 ${closes.length} 個交易日，少於 KD(9) 需要的 9 天，暫時無法計算，之後資料累積足夠會自動算出來。` }]
      : null,
    kd9 === null
      ? ['d9d', { status: 'no_data', message: `資料只有 ${closes.length} 個交易日，少於 KD(9) 需要的 9 天，暫時無法計算，之後資料累積足夠會自動算出來。` }]
      : null,
    kd14 === null
      ? ['k14d', { status: 'no_data', message: `資料只有 ${closes.length} 個交易日，少於 KD(14) 需要的 14 天，暫時無法計算，之後資料累積足夠會自動算出來。` }]
      : null,
    kd14 === null
      ? ['d14d', { status: 'no_data', message: `資料只有 ${closes.length} 個交易日，少於 KD(14) 需要的 14 天，暫時無法計算，之後資料累積足夠會自動算出來。` }]
      : null,
  ];

  try {
    await analysisPrisma.kdResult.upsert({
      where: { symbol_tradeDate: { symbol: symbol, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`) } },
      create: {
        symbol: symbol,
        tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`),
        k9d: kd9?.k ?? null,
        d9d: kd9?.d ?? null,
        k14d: kd14?.k ?? null,
        d14d: kd14?.d ?? null,
        warnings,
      },
      update: { k9d: kd9?.k ?? null, d9d: kd9?.d ?? null, k14d: kd14?.k ?? null, d14d: kd14?.d ?? null, warnings },
    });
  } catch (error) {
    console.error('[kd]: 寫入 technicals_kd 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    asOfDate: effectiveAsOf,
    k9d: { value: kd9?.k ?? null, window: 9 },
    d9d: { value: kd9?.d ?? null, window: 9 },
    k14d: { value: kd14?.k ?? null, window: 14 },
    d14d: { value: kd14?.d ?? null, window: 14 },
    dataCoverage: { tradingDays: closes.length, earliestDate: series[0]!.tradeDate },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
