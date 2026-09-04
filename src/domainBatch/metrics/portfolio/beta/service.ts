import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { BetaQuery, BetaResult, BetaSamplingFrequency, BetaWindow } from './types';
import { logger } from '@/shared/logger';

interface RawDailyPriceCloseRow {
  trade_date: Date;
  close: unknown;
}

interface RawDateRangeRow {
  min_date: Date | null;
  max_date: Date | null;
}

const MIN_OBSERVATIONS = 20; // 降頻後至少要有 20 個取樣點（19 個報酬率樣本）才計算，樣本太少的 Beta 沒有統計意義；三個窗口共用同一個門檻，不分頻率調整

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

export interface OverlapPoint {
  tradeDate: string; // YYYY-MM-DD
  stockClose: number;
  indexClose: number;
}

// ISO 8601 週數（週一為一週開始，該週的週四落在哪個西元年就算哪一年的第幾週）——只是用來把
// 交易日分桶，桶的邊界要跟真實曆法週一致，不需要非常講究「第幾週」這個數字本身正不正確。
const getIsoWeekKey = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const dayNum = (d.getUTCDay() + 6) % 7; // 週一=0 ... 週日=6
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  const firstWeekMonday = new Date(firstThursday);
  firstWeekMonday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum);
  const weekNum = Math.round((thursday.getTime() - firstWeekMonday.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
};

const getMonthKey = (dateStr: string): string => dateStr.slice(0, 7); // YYYY-MM

// 2026-08-26 起改成長窗口降頻取樣，對齊 Bloomberg（2Y 用週）、Yahoo Finance（5Y 用月）常見做法。
// 降頻方式：每個週期（週/月）取「最後一個重疊交易日」當代表點，不是隨便挑或用平均——`points`
// 已經依日期升冪排序，用 Map 依序覆寫同一個週期 key，最後留下的就是該週期最晚的一筆。
export const resample = (points: OverlapPoint[], frequency: BetaSamplingFrequency): OverlapPoint[] => {
  if (frequency === 'daily') return points;
  const keyFn = frequency === 'weekly' ? getIsoWeekKey : getMonthKey;
  const lastByPeriod = new Map<string, OverlapPoint>();
  for (const p of points) {
    lastByPeriod.set(keyFn(p.tradeDate), p);
  }
  return Array.from(lastByPeriod.values());
};

// 給定重疊交易日序列（依日期升冪排序），算窗口內的 Beta——先按日期範圍切窗口，再依 frequency 降頻，
// 最後用降頻後相鄰兩點的報酬率算 Beta。三個窗口共用同一份 MIN_OBSERVATIONS 門檻（見上方），
// 不分頻率調整，門檻定義是「取樣點數」不是「交易日數」。
const computeWindow = (points: OverlapPoint[], windowEnd: Date, years: number, frequency: BetaSamplingFrequency): BetaWindow => {
  const windowStartDate = subtractYears(windowEnd, years);
  const windowStartStr = toDateString(windowStartDate);
  const windowEndStr = toDateString(windowEnd);
  const windowedDaily = points.filter((p) => p.tradeDate >= windowStartStr && p.tradeDate <= windowEndStr);
  const windowed = resample(windowedDaily, frequency);

  if (windowed.length < MIN_OBSERVATIONS) {
    return {
      value: null,
      samplingFrequency: frequency,
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
    samplingFrequency: frequency,
    windowStart: windowed[0]!.tradeDate,
    windowEnd: windowed[windowed.length - 1]!.tradeDate,
    observations: windowed.length,
  };
};

export const calculateBeta = async (query: BetaQuery): Promise<BetaResult> => {
  const { symbol, asOfDate } = query;
  const warnings: string[] = [];
  const requestedAsOf = asOfDate ? new Date(`${asOfDate}T00:00:00.000Z`) : null;

  // 兩張表資料量都不大（單一 symbol 最多幾千筆、指數表幾百筆），5 年份直接整段抓進來，
  // 不用逐窗口各查一次——1Y/2Y/5Y 共用同一份重疊交易日序列，分窗口時用日期範圍過濾即可。
  // 2026-09-03 使用者決定 curated 中台層現階段太早，改回直接查 twseExportPrisma（export
  // schema 沒有唯一識別欄位，走 $queryRaw）。
  const fiveYearsBack = subtractYears(requestedAsOf ?? new Date(), 5);

  const [stockRows, indexRows, stockRangeRows, indexRangeRows] = await Promise.all([
    requestedAsOf
      ? twseExportPrisma.$queryRaw<RawDailyPriceCloseRow[]>`
          SELECT trade_date, close FROM "export"."daily_price"
          WHERE symbol = ${symbol} AND trade_date >= ${fiveYearsBack} AND trade_date <= ${requestedAsOf}
          ORDER BY trade_date ASC
        `
      : twseExportPrisma.$queryRaw<RawDailyPriceCloseRow[]>`
          SELECT trade_date, close FROM "export"."daily_price"
          WHERE symbol = ${symbol} AND trade_date >= ${fiveYearsBack}
          ORDER BY trade_date ASC
        `,
    requestedAsOf
      ? twseExportPrisma.$queryRaw<RawDailyPriceCloseRow[]>`
          SELECT trade_date, close FROM "export"."daily_taiex_index"
          WHERE trade_date >= ${fiveYearsBack} AND trade_date <= ${requestedAsOf}
          ORDER BY trade_date ASC
        `
      : twseExportPrisma.$queryRaw<RawDailyPriceCloseRow[]>`
          SELECT trade_date, close FROM "export"."daily_taiex_index"
          WHERE trade_date >= ${fiveYearsBack}
          ORDER BY trade_date ASC
        `,
    twseExportPrisma.$queryRaw<RawDateRangeRow[]>`SELECT MIN(trade_date) AS min_date, MAX(trade_date) AS max_date FROM "export"."daily_price" WHERE symbol = ${symbol}`,
    twseExportPrisma.$queryRaw<RawDateRangeRow[]>`SELECT MIN(trade_date) AS min_date, MAX(trade_date) AS max_date FROM "export"."daily_taiex_index"`,
  ]);
  const stockRange = stockRangeRows[0]!;
  const indexRange = indexRangeRows[0]!;

  // 股價、大盤指數都改用 oingg-twse（daily_price / daily_taiex_index），不再用 mops 已消失的
  // daily_stock_price / daily_market_index——見 shared/sourceData/marketCap.ts 開頭的說明。
  const dataCoverage = {
    stockPriceDateRange: {
      min: stockRange.min_date ? toDateString(stockRange.min_date) : null,
      max: stockRange.max_date ? toDateString(stockRange.max_date) : null,
    },
    marketIndexDateRange: {
      min: indexRange.min_date ? toDateString(indexRange.min_date) : null,
      max: indexRange.max_date ? toDateString(indexRange.max_date) : null,
    },
  };

  const emptyWindow = (frequency: BetaSamplingFrequency): BetaWindow => ({
    value: null,
    samplingFrequency: frequency,
    windowStart: null,
    windowEnd: null,
    observations: 0,
  });

  // oingg-twse daily_price 覆蓋率會持續成長（2026-08-30 起改用這張表，個別公司歷史深度不一：
  // 6 家種子公司回填了約 5 年，其他公司多半只有近幾個月）——查無資料視為「不適用」，不是
  // 「查無資料待補」，因為這不是時間到了就會自己有的資料缺口，是覆蓋率本身的限制，見
  // portfolio/README.md 說明。這裡本來就是現查 stockRange（不是寫死公司代號判斷），只有訊息
  // 文字需要跟著覆蓋率更新，不要再點名固定是哪幾家。
  if (stockRange.min_date === null) {
    warnings.push(`daily_price 目前沒有 ${symbol} 的股價序列，無法計算 Beta（覆蓋率之後會持續成長）。`);
    const notApplicable: MetricStatus = {
      status: 'not_applicable',
      message: `daily_price 目前沒有涵蓋 ${symbol}，這家公司不適用（不是資料還沒補齊，是目前完全沒有覆蓋這檔股票，覆蓋率之後會持續成長）。`,
    };
    return {
      symbol,
      asOfDate: null,
      beta1Y: emptyWindow('daily'),
      beta2Y: emptyWindow('weekly'),
      beta5Y: emptyWindow('monthly'),
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
    if (row.close !== null) indexByDate.set(toDateString(row.trade_date), Number(row.close));
  }
  const overlap: OverlapPoint[] = [];
  for (const row of stockRows) {
    if (row.close === null) continue;
    const dateStr = toDateString(row.trade_date);
    const indexClose = indexByDate.get(dateStr);
    if (indexClose !== undefined) {
      overlap.push({ tradeDate: dateStr, stockClose: Number(row.close), indexClose });
    }
  }

  if (overlap.length === 0) {
    warnings.push('查無股價與指數都有資料的重疊交易日，無法計算 Beta（兩個資料源的交易日完全沒有交集）。');
    const noData: MetricStatus = { status: 'no_data', message: '查無股價與指數都有資料的重疊交易日。' };
    return {
      symbol,
      asOfDate: null,
      beta1Y: emptyWindow('daily'),
      beta2Y: emptyWindow('weekly'),
      beta5Y: emptyWindow('monthly'),
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

  // 1Y 用日資料、2Y 用週資料（對齊 Bloomberg）、5Y 用月資料（對齊 Yahoo Finance）——
  // 見 src/domainBatch/metrics/portfolio/README.md「Beta 計算口徑」的說明。
  const beta1Y = computeWindow(overlap, effectiveAsOfDate, 1, 'daily');
  const beta2Y = computeWindow(overlap, effectiveAsOfDate, 2, 'weekly');
  const beta5Y = computeWindow(overlap, effectiveAsOfDate, 5, 'monthly');

  const insufficientSampleMessage = (window: BetaWindow): string =>
    `降頻成${window.samplingFrequency === 'daily' ? '日' : window.samplingFrequency === 'weekly' ? '週' : '月'}資料後只有 ${window.observations} 個取樣點，少於門檻 ${MIN_OBSERVATIONS}，樣本數不足以計算有意義的 Beta。5 年窗口容易卡在指數資料（${dataCoverage.marketIndexDateRange.max}）比股價資料（${dataCoverage.stockPriceDateRange.max}）舊，重疊區間比想像中短。`;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    beta1Y.value === null ? ['beta1Y', { status: 'calculation_error' as const, message: insufficientSampleMessage(beta1Y) }] : null,
    beta2Y.value === null ? ['beta2Y', { status: 'calculation_error' as const, message: insufficientSampleMessage(beta2Y) }] : null,
    beta5Y.value === null ? ['beta5Y', { status: 'calculation_error' as const, message: insufficientSampleMessage(beta5Y) }] : null,
  ];

  // 存進 oingg-analysis DB 的 portfolio_beta，PK 用 symbol+tradeDate（逐日基準日，不是財務
  // 季度，DB 欄位 2026-09-04 從 asOfDate 改名跟其他日資料型結果表統一，對外 API 參數仍叫
  // asOfDate 不受影響），跟 marketRatios/ 同一種「跟季度脫鉤」的存檔模式。存檔失敗不應該讓
  // 已經算好的結果回傳失敗。
  try {
    await analysisPrisma.betaResult.upsert({
      where: { symbol_tradeDate: { symbol: symbol, tradeDate: effectiveAsOfDate } },
      create: {
        symbol: symbol,
        tradeDate: effectiveAsOfDate,
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
    logger.error({ err: error }, '[beta]: 寫入 portfolio_beta 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    asOfDate: effectiveAsOf,
    beta1Y,
    beta2Y,
    beta5Y,
    dataCoverage,
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
