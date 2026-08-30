import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { resolvePriceSeries } from '@/shared/priceSeries';
import { hasStockPriceCoverage } from '@/shared/marketCap';
import { exponentialMovingAverageSeries } from '@/shared/technicalMath';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { MacdQuery, MacdResult } from './types';

const SHORT_WINDOW = 12;
const LONG_WINDOW = 26;
const SIGNAL_WINDOW = 9;
// EMA(26) 至少要 3 倍窗口以上的歷史才算「充分收斂」——業界常見的粗略經驗法則，見 types.ts 說明。
const CONVERGED_THRESHOLD = LONG_WINDOW * 3;

const round4 = (x: number): number => Math.round(x * 10000) / 10000;

export const calculateMacd = async (query: MacdQuery): Promise<MacdResult> => {
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
    warnings.push(covered ? `${companyId} 查無股價資料，無法計算 MACD。` : `${companyId} 不在 daily_price 覆蓋範圍內，無法計算 MACD。`);
    return {
      companyId,
      asOfDate: null,
      dif: null,
      dem: null,
      osc: null,
      dataCoverage: { tradingDays: 0, earliestDate: null, emaConverged: false },
      fieldStatuses: buildFieldStatuses([
        ['dif', status],
        ['dem', status],
        ['osc', status],
      ]),
      warnings,
    };
  }

  const closes = series.map((p) => p.close).filter((c): c is number => c !== null);

  const ema12Series = exponentialMovingAverageSeries(closes, SHORT_WINDOW);
  const ema26Series = exponentialMovingAverageSeries(closes, LONG_WINDOW);

  // DIF 只有在 EMA(12)、EMA(26) 都算得出來的位置才有值，也就是從第 26 筆（index 25）開始。
  const validDif: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const short = ema12Series[i];
    const long = ema26Series[i];
    if (short != null && long != null) validDif.push(round4(short - long));
  }

  const dif = validDif.length > 0 ? validDif[validDif.length - 1]! : null;

  let dem: number | null = null;
  let osc: number | null = null;
  if (validDif.length >= SIGNAL_WINDOW) {
    const demSeries = exponentialMovingAverageSeries(validDif, SIGNAL_WINDOW);
    dem = demSeries[demSeries.length - 1]!;
    osc = round4(dif! - dem);
  }

  const emaConverged = closes.length >= CONVERGED_THRESHOLD;
  if (dif !== null && !emaConverged) {
    warnings.push(`資料只有 ${closes.length} 個交易日，少於 EMA(26) 建議的收斂門檻（約 ${CONVERGED_THRESHOLD} 天），DIF/DEM/OSC 數值僅供參考，隨資料累積會愈來愈準確。`);
  }

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    dif === null ? ['dif', { status: 'no_data', message: `資料只有 ${closes.length} 個交易日，少於 EMA(26) 需要的 26 天，暫時無法計算 DIF，之後資料累積足夠會自動算出來。` }] : null,
    dem === null
      ? ['dem', { status: 'no_data', message: `DIF 序列只有 ${validDif.length} 筆，少於 EMA(9) 需要的 9 筆，暫時無法計算 DEM，之後資料累積足夠會自動算出來。` }]
      : null,
    osc === null
      ? ['osc', { status: 'no_data', message: `DIF 或 DEM 任一為 null，無法計算 OSC，詳見 dif/dem 各自的 fieldStatuses。` }]
      : null,
  ];

  try {
    await analysisPrisma.macdResult.upsert({
      where: { symbol_tradeDate: { symbol: companyId, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`) } },
      create: { symbol: companyId, tradeDate: new Date(`${effectiveAsOf}T00:00:00.000Z`), dif, dem, osc, warnings },
      update: { dif, dem, osc, warnings },
    });
  } catch (error) {
    console.error('[macd]: 寫入 technicals_macd 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    asOfDate: effectiveAsOf,
    dif,
    dem,
    osc,
    dataCoverage: { tradingDays: closes.length, earliestDate: series[0]!.tradeDate, emaConverged },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
