import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolvePriceSeries } from '@/shared/sourceData/priceSeries';
import { hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { bollingerBands } from '@/shared/technicalMath';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { BollingerBandsQuery, BollingerBandsResult, BandValue } from './types';

const WINDOW = 20;
const MULTIPLIER = 2;

export const calculateBollingerBands = async (query: BollingerBandsQuery): Promise<BollingerBandsResult> => {
  const { symbol, asOfDate } = query;
  const warnings: string[] = [];

  const emptyBand = (): BandValue => ({ value: null, window: WINDOW });

  const { series, effectiveAsOf, fellBackFromRequestedDate } = await resolvePriceSeries(symbol, asOfDate);
  if (fellBackFromRequestedDate) {
    warnings.push(`指定日期 ${asOfDate} 不是交易日或還沒有資料，改用往前最近的交易日 ${effectiveAsOf}。`);
  }

  if (series.length === 0) {
    const covered = await hasStockPriceCoverage(symbol);
    const status: MetricStatus = covered
      ? { status: 'no_data', message: '查無股價資料。' }
      : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };
    warnings.push(covered ? `${symbol} 查無股價資料，無法計算布林通道。` : `${symbol} 不在 daily_price 覆蓋範圍內，無法計算布林通道。`);
    return {
      symbol,
      asOfDate: null,
      middle: emptyBand(),
      upper: emptyBand(),
      lower: emptyBand(),
      dataCoverage: { tradingDays: 0, earliestDate: null },
      fieldStatuses: buildFieldStatuses([
        ['middle', status],
        ['upper', status],
        ['lower', status],
      ]),
      warnings,
    };
  }

  const closes = series.map((p) => p.close).filter((c): c is number => c !== null);
  const bands = bollingerBands(closes, WINDOW, MULTIPLIER);

  const fieldStatusEntries: Array<[string, MetricStatus] | null> =
    bands === null
      ? (['middle', 'upper', 'lower'] as const).map(
          (key) =>
            [key, { status: 'no_data', message: `資料只有 ${closes.length} 個交易日，少於布林通道需要的 ${WINDOW} 天，暫時無法計算，之後資料累積足夠會自動算出來。` }] as [
              string,
              MetricStatus,
            ]
        )
      : [];

  try {
    await analysisPrisma.bollingerBandsResult.upsert({
      where: { symbol_tradeDate: { symbol: symbol, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`) } },
      create: { symbol: symbol, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`), middle: bands?.middle ?? null, upper: bands?.upper ?? null, lower: bands?.lower ?? null, warnings },
      update: { middle: bands?.middle ?? null, upper: bands?.upper ?? null, lower: bands?.lower ?? null, warnings },
    });
  } catch (error) {
    console.error('[bollinger-bands]: 寫入 technicals_bollinger_bands 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    asOfDate: effectiveAsOf,
    middle: { value: bands?.middle ?? null, window: WINDOW },
    upper: { value: bands?.upper ?? null, window: WINDOW },
    lower: { value: bands?.lower ?? null, window: WINDOW },
    dataCoverage: { tradingDays: closes.length, earliestDate: series[0]!.tradeDate },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
