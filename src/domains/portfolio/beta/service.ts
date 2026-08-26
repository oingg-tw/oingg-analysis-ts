import prisma from '../../../adapters/prisma/index';
import { analysisPrisma } from '../../../adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus } from '../../../shared/metricStatus';
import type { BetaQuery, BetaResult, BetaWindow } from './types';

const MIN_OBSERVATIONS = 20; // 至少要有 20 個重疊交易日（19 個報酬率樣本）才計算，樣本太少的 Beta 沒有統計意義

const toDateString = (d: Date): string => d.toISOString().slice(0, 10);

// 加減「年」用日曆年（跟其他指標用 ROC 年季計算窗口是同一種「日期為準，不是湊固定天數」的風格）。
const subtractYears = (date: Date, years: number): Date => {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

const mean = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;

// Beta = Cov(個股日報酬率, 指數日報酬率) / Var(指數日報酬率)，樣本共變異數/變異數（分母 n-1）。
// 指數變異數為 0（窗口內指數完全沒波動，理論上不會發生但防呆）時回傳 null，避免除以零。
const computeBeta = (stockReturns: number[], indexReturns: number[]): number | null => {
  const n = stockReturns.length;
  if (n < 2) return null;
  const meanStock = mean(stockReturns);
  const meanIndex = mean(indexReturns);
  let covariance = 0;
  let varianceIndex = 0;
  for (let i = 0; i < n; i++) {
    covariance += (stockReturns[i]! - meanStock) * (indexReturns[i]! - meanIndex);
    varianceIndex += (indexReturns[i]! - meanIndex) ** 2;
  }
  covariance /= n - 1;
  varianceIndex /= n - 1;
  if (varianceIndex === 0) return null;
  return Math.round((covariance / varianceIndex) * 10000) / 10000;
};

interface OverlapPoint {
  tradeDate: string; // YYYY-MM-DD
  stockClose: number;
  indexClose: number;
}

// 給定重疊交易日序列（依日期升冪排序），算窗口內的 Beta。
const computeWindow = (points: OverlapPoint[], windowEnd: Date, years: number): BetaWindow => {
  const windowStartDate = subtractYears(windowEnd, years);
  const windowStartStr = toDateString(windowStartDate);
  const windowEndStr = toDateString(windowEnd);
  const windowed = points.filter((p) => p.tradeDate >= windowStartStr && p.tradeDate <= windowEndStr);

  if (windowed.length < MIN_OBSERVATIONS) {
    return {
      value: null,
      windowStart: windowed[0]?.tradeDate ?? null,
      windowEnd: windowed[windowed.length - 1]?.tradeDate ?? null,
      observations: windowed.length,
    };
  }

  const stockReturns: number[] = [];
  const indexReturns: number[] = [];
  for (let i = 1; i < windowed.length; i++) {
    const prev = windowed[i - 1]!;
    const curr = windowed[i]!;
    if (prev.stockClose === 0 || prev.indexClose === 0) continue; // 防呆：收盤價 0（理論上不該發生）會讓報酬率無限大
    stockReturns.push((curr.stockClose - prev.stockClose) / prev.stockClose);
    indexReturns.push((curr.indexClose - prev.indexClose) / prev.indexClose);
  }

  return {
    value: computeBeta(stockReturns, indexReturns),
    windowStart: windowed[0]!.tradeDate,
    windowEnd: windowed[windowed.length - 1]!.tradeDate,
    observations: windowed.length,
  };
};

export const calculateBeta = async (query: BetaQuery): Promise<BetaResult> => {
  const { companyId, asOfDate } = query;
  const warnings: string[] = [];
  const requestedAsOf = asOfDate ? new Date(`${asOfDate}T00:00:00.000Z`) : null;

  // 兩張表資料量都不大（單一 symbol 最多幾千筆、指數表幾百筆），5 年份直接整段抓進來，
  // 不用逐窗口各查一次——1Y/2Y/5Y 共用同一份重疊交易日序列，分窗口時用日期範圍過濾即可。
  const fiveYearsBack = subtractYears(requestedAsOf ?? new Date(), 5);
  const upperBoundClause = requestedAsOf ? { lte: requestedAsOf } : undefined;

  const [stockRows, indexRows, stockRange, indexRange] = await Promise.all([
    prisma.dailyStockPrice.findMany({
      where: { symbol: companyId, tradeDate: { gte: fiveYearsBack, ...upperBoundClause } },
      orderBy: { tradeDate: 'asc' },
      select: { tradeDate: true, closePrice: true },
    }),
    prisma.dailyMarketIndex.findMany({
      where: { tradeDate: { gte: fiveYearsBack, ...upperBoundClause } },
      orderBy: { tradeDate: 'asc' },
      select: { tradeDate: true, closeIndex: true },
    }),
    prisma.dailyStockPrice.aggregate({ where: { symbol: companyId }, _min: { tradeDate: true }, _max: { tradeDate: true } }),
    prisma.dailyMarketIndex.aggregate({ _min: { tradeDate: true }, _max: { tradeDate: true } }),
  ]);

  const dataCoverage = {
    stockPriceDateRange: {
      min: stockRange._min.tradeDate ? toDateString(stockRange._min.tradeDate) : null,
      max: stockRange._max.tradeDate ? toDateString(stockRange._max.tradeDate) : null,
    },
    marketIndexDateRange: {
      min: indexRange._min.tradeDate ? toDateString(indexRange._min.tradeDate) : null,
      max: indexRange._max.tradeDate ? toDateString(indexRange._max.tradeDate) : null,
    },
  };

  const emptyWindow = (): BetaWindow => ({ value: null, windowStart: null, windowEnd: null, observations: 0 });

  // daily_stock_price 目前只有 2330 有資料——查無資料視為「不適用」，不是「查無資料待補」，
  // 因為這不是時間到了就會自己有的資料缺口，是覆蓋率本身的限制，見 portfolio/README.md 說明。
  if (stockRange._min.tradeDate === null) {
    warnings.push(`daily_stock_price 目前只有 2330（台積電）有資料，查無 ${companyId} 的股價序列，無法計算 Beta。`);
    const notApplicable: MetricStatus = {
      status: 'not_applicable',
      message: `daily_stock_price 目前只有 2330 有資料，${companyId} 不適用（不是資料還沒補齊，是目前完全沒有覆蓋這檔股票）。`,
    };
    return {
      companyId,
      asOfDate: null,
      beta1Y: emptyWindow(),
      beta2Y: emptyWindow(),
      beta5Y: emptyWindow(),
      dataCoverage,
      fieldStatuses: buildFieldStatuses([
        ['beta1Y', notApplicable],
        ['beta2Y', notApplicable],
        ['beta5Y', notApplicable],
      ]),
      warnings,
    };
  }

  // 建立「股價跟指數都有資料」的重疊交易日序列（依日期字串比對，兩張表都已經是 YYYY-MM-DD 顆粒度）。
  const indexByDate = new Map<string, number>();
  for (const row of indexRows) {
    if (row.closeIndex !== null) indexByDate.set(toDateString(row.tradeDate), Number(row.closeIndex));
  }
  const overlap: OverlapPoint[] = [];
  for (const row of stockRows) {
    if (row.closePrice === null) continue;
    const dateStr = toDateString(row.tradeDate);
    const indexClose = indexByDate.get(dateStr);
    if (indexClose !== undefined) {
      overlap.push({ tradeDate: dateStr, stockClose: Number(row.closePrice), indexClose });
    }
  }

  if (overlap.length === 0) {
    warnings.push('查無股價與指數都有資料的重疊交易日，無法計算 Beta（兩個資料源的交易日完全沒有交集）。');
    const noData: MetricStatus = { status: 'no_data', message: '查無股價與指數都有資料的重疊交易日。' };
    return {
      companyId,
      asOfDate: null,
      beta1Y: emptyWindow(),
      beta2Y: emptyWindow(),
      beta5Y: emptyWindow(),
      dataCoverage,
      fieldStatuses: buildFieldStatuses([
        ['beta1Y', noData],
        ['beta2Y', noData],
        ['beta5Y', noData],
      ]),
      warnings,
    };
  }

  // 實際基準日 = 重疊交易日序列裡最新的一天（如果有指定 asOfDate，就是指定日期或之前最近的重疊交易日）。
  const effectiveAsOf = overlap[overlap.length - 1]!.tradeDate;
  const effectiveAsOfDate = new Date(`${effectiveAsOf}T00:00:00.000Z`);
  if (requestedAsOf && effectiveAsOf !== toDateString(requestedAsOf)) {
    warnings.push(`指定日期 ${asOfDate} 不是股價與指數同時有資料的交易日，改用往前最近的重疊交易日 ${effectiveAsOf}。`);
  }

  const beta1Y = computeWindow(overlap, effectiveAsOfDate, 1);
  const beta2Y = computeWindow(overlap, effectiveAsOfDate, 2);
  const beta5Y = computeWindow(overlap, effectiveAsOfDate, 5);

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    beta1Y.value === null
      ? [
          'beta1Y',
          {
            status: 'calculation_error' as const,
            message: `窗口內重疊交易日只有 ${beta1Y.observations} 天，少於門檻 ${MIN_OBSERVATIONS} 天，樣本數不足以計算有意義的 Beta。`,
          },
        ]
      : null,
    beta2Y.value === null
      ? [
          'beta2Y',
          {
            status: 'calculation_error' as const,
            message: `窗口內重疊交易日只有 ${beta2Y.observations} 天，少於門檻 ${MIN_OBSERVATIONS} 天，樣本數不足以計算有意義的 Beta。`,
          },
        ]
      : null,
    beta5Y.value === null
      ? [
          'beta5Y',
          {
            status: 'calculation_error' as const,
            message: `窗口內重疊交易日只有 ${beta5Y.observations} 天，少於門檻 ${MIN_OBSERVATIONS} 天，樣本數不足以計算有意義的 Beta。5 年窗口容易卡在指數資料（${dataCoverage.marketIndexDateRange.max}）比股價資料（${dataCoverage.stockPriceDateRange.max}）舊，重疊區間比想像中短。`,
          },
        ]
      : null,
  ];

  // 存進 oingg-analysis DB 的 portfolio_beta，PK 用 symbol+asOfDate（逐日基準日，不是財務季度），
  // 跟 marketRatios/ 同一種「跟季度脫鉤」的存檔模式。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.betaResult.upsert({
      where: { symbol_asOfDate: { symbol: companyId, asOfDate: effectiveAsOfDate } },
      create: {
        symbol: companyId,
        asOfDate: effectiveAsOfDate,
        beta1Y: beta1Y.value,
        beta2Y: beta2Y.value,
        beta5Y: beta5Y.value,
        observations1Y: beta1Y.observations,
        observations2Y: beta2Y.observations,
        observations5Y: beta5Y.observations,
        warnings,
      },
      update: {
        beta1Y: beta1Y.value,
        beta2Y: beta2Y.value,
        beta5Y: beta5Y.value,
        observations1Y: beta1Y.observations,
        observations2Y: beta2Y.observations,
        observations5Y: beta5Y.observations,
        warnings,
      },
    });
  } catch (error) {
    console.error('[beta]: 寫入 portfolio_beta 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    asOfDate: effectiveAsOf,
    beta1Y,
    beta2Y,
    beta5Y,
    dataCoverage,
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
