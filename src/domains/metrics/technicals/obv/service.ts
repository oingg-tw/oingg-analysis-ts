import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolvePriceSeries } from '@/shared/sourceData/priceSeries';
import { hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { onBalanceVolume } from '@/shared/technicalMath';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { ObvQuery, ObvResult } from './types';

export const calculateObv = async (query: ObvQuery): Promise<ObvResult> => {
  const { companyId, asOfDate } = query;
  const warnings: string[] = [];

  const { series, effectiveAsOf, fellBackFromRequestedDate } = await resolvePriceSeries(companyId, asOfDate);
  if (fellBackFromRequestedDate) {
    warnings.push(`指定日期 ${asOfDate} 不是交易日或還沒有資料，改用往前最近的交易日 ${effectiveAsOf}。`);
  }

  if (series.length === 0) {
    const covered = await hasStockPriceCoverage(companyId);
    const status: MetricStatus = covered
      ? { status: 'no_data', message: '查無股價資料。' }
      : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };
    warnings.push(covered ? `${companyId} 查無股價資料，無法計算 OBV。` : `${companyId} 不在 daily_price 覆蓋範圍內，無法計算 OBV。`);
    return {
      companyId,
      asOfDate: null,
      obv: null,
      dataCoverage: { tradingDays: 0, earliestDate: null },
      fieldStatuses: buildFieldStatuses([['obv', status]]),
      warnings,
    };
  }

  const closes: number[] = [];
  const volumes: bigint[] = [];
  for (const point of series) {
    if (point.close === null || point.volume === null) continue;
    closes.push(point.close);
    volumes.push(point.volume);
  }

  const obv = onBalanceVolume(closes, volumes);
  if (obv === null) warnings.push('股價序列裡收盤價或成交量缺漏，無法計算 OBV。');

  try {
    await analysisPrisma.obvResult.upsert({
      where: { symbol_tradeDate: { symbol: companyId, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`) } },
      create: { symbol: companyId, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`), obv, warnings },
      update: { obv, warnings },
    });
  } catch (error) {
    console.error('[obv]: 寫入 technicals_obv 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    asOfDate: effectiveAsOf,
    obv: obv?.toString() ?? null,
    dataCoverage: { tradingDays: closes.length, earliestDate: series[0]!.tradeDate },
    fieldStatuses: buildFieldStatuses(obv === null ? [['obv', { status: 'no_data', message: '股價序列裡收盤價或成交量缺漏，無法計算 OBV。' }]] : []),
    warnings,
  };
};
