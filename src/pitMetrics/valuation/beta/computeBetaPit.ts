import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import { writeMetricValue, type MetricValueWriteOutcome, DAILY_CADENCE_FISCAL_QUARTER, rollingWindowGroup } from '../../metricValueWriter';
import type { LookbackRange, SamplingInterval, MetricNullReason } from '../../metricBasis';

// 獨立重新實作 src/domainMetrics/beta.ts——同一套公式跟降頻邏輯（不呼叫舊架構），改寫成
// pitMetrics 的寫入形狀：舊架構是「一列存三個窗口」，這裡是「一個 metricCode='beta'，
// 三個 (lookbackRange, samplingInterval) 組合各自一列」（1Y×1D/2Y×1W/5Y×1M，見
// metricBasis.ts 的說明），跟 dupont 家族「一個概念拆成多個獨立 metric_code」的先例是
// 同一種精神，只是這裡反過來是「一個 metric_code、多個 (lookbackRange, samplingInterval)
// 組合」，因為三個窗口本來就是同一個概念（系統性風險係數）在不同取樣頻率下的版本，不是
// 三個不同概念。
//
// Beta = Cov(個股報酬率, 加權股價指數報酬率) / Var(加權股價指數報酬率)，三個窗口各自
// 獨立計算（各自取基準日往前 N 年的重疊交易日再降頻，不是用短窗口的資料湊長窗口）：
// 1Y 用日資料、2Y 用週資料（對齊 Bloomberg BETA 頁面）、5Y 用月資料（對齊 Morningstar/
// S&P 長期 Beta 標準）。
//
// knowledgeDate 用 resolveDailyCadenceKnowledgeDate——逐日股價資料沒有公告延遲，基準
// 交易日當天就是市場已知的那天，跟 knowledgeDate.ts 的既有說明一致。fiscalQuarter 用
// DAILY_CADENCE_FISCAL_QUARTER sentinel，fiscalYear 是基準交易日的西元年，tradeDate
// 純資訊性欄位填基準交易日本身——跟 MarketRatios（computeMarketRatiosPit.ts）同一套
// 逐日型指標寫入慣例。

export type BetaSamplingFrequency = 'daily' | 'weekly' | 'monthly';

interface BetaWindowConfig {
  outputKey: 'beta1YDaily' | 'beta2YWeekly' | 'beta5YMonthly';
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  years: number;
  frequency: BetaSamplingFrequency;
}

const WINDOW_CONFIGS: BetaWindowConfig[] = [
  { outputKey: 'beta1YDaily', lookbackRange: '1Y', samplingInterval: '1D', years: 1, frequency: 'daily' },
  { outputKey: 'beta2YWeekly', lookbackRange: '2Y', samplingInterval: '1W', years: 2, frequency: 'weekly' },
  { outputKey: 'beta5YMonthly', lookbackRange: '5Y', samplingInterval: '1M', years: 5, frequency: 'monthly' },
];

const MIN_OBSERVATIONS = 20; // 降頻後至少要有 20 個取樣點（19 個報酬率樣本），跟舊架構同一個門檻。

export interface BetaPitQuery {
  symbol: string;
  date?: Date; // 選填，格式對齊舊架構的 asOfDate；不給就抓「股價跟指數都有資料的最新一個重疊交易日」
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

interface RawDailyPriceCloseRow {
  trade_date: Date;
  close: unknown;
}

interface RawDateRangeRow {
  min_date: Date | null;
}

interface OverlapPoint {
  tradeDate: string; // YYYY-MM-DD
  stockClose: number;
  indexClose: number;
}

const toDateString = (d: Date): string => d.toISOString().slice(0, 10);

const subtractYears = (date: Date, years: number): Date => {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

const mean = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;

// ISO 8601 週數（週一為一週開始，該週的週四落在哪個西元年就算哪一年的第幾週）——跟
// domainMetrics/beta.ts 完全相同的分桶邏輯，避免跨年邊界誤判。
const getIsoWeekKey = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const dayNum = (d.getUTCDay() + 6) % 7;
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

const getMonthKey = (dateStr: string): string => dateStr.slice(0, 7);

const resample = (points: OverlapPoint[], frequency: BetaSamplingFrequency): OverlapPoint[] => {
  if (frequency === 'daily') return points;
  const keyFn = frequency === 'weekly' ? getIsoWeekKey : getMonthKey;
  const lastByPeriod = new Map<string, OverlapPoint>();
  for (const p of points) {
    lastByPeriod.set(keyFn(p.tradeDate), p);
  }
  return Array.from(lastByPeriod.values());
};

// 樣本共變異數/變異數（分母 n-1）。指數變異數為 0（理論上不會發生但防呆）回傳 null。
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

interface WindowComputation {
  value: number | null;
  observations: number;
  nullReason: MetricNullReason | null;
}

const computeWindow = (points: OverlapPoint[], windowEnd: Date, config: BetaWindowConfig): WindowComputation => {
  const windowStartStr = toDateString(subtractYears(windowEnd, config.years));
  const windowEndStr = toDateString(windowEnd);
  const windowedDaily = points.filter((p) => p.tradeDate >= windowStartStr && p.tradeDate <= windowEndStr);
  const windowed = resample(windowedDaily, config.frequency);

  if (windowed.length < MIN_OBSERVATIONS) {
    return { value: null, observations: windowed.length, nullReason: 'insufficient_history' };
  }

  const stockReturns: number[] = [];
  const indexReturns: number[] = [];
  for (let i = 1; i < windowed.length; i++) {
    const prev = windowed[i - 1]!;
    const curr = windowed[i]!;
    if (prev.stockClose === 0 || prev.indexClose === 0) continue;
    stockReturns.push((curr.stockClose - prev.stockClose) / prev.stockClose);
    indexReturns.push((curr.indexClose - prev.indexClose) / prev.indexClose);
  }

  const value = computeBeta(stockReturns, indexReturns);
  return { value, observations: windowed.length, nullReason: value === null ? 'zero_or_negative_denominator' : null };
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_trade_date' };

export interface BetaPitOutcome {
  symbol: string;
  tradeDate: string | null;
  beta1YDaily: BasisOutcome;
  beta2YWeekly: BasisOutcome;
  beta5YMonthly: BasisOutcome;
}

export const computeAndWriteBetaPit = async (query: BetaPitQuery): Promise<BetaPitOutcome> => {
  const { symbol, date, dataType, subsidiaryCompanyId } = query;

  const skippedNoTradeDate: BetaPitOutcome = {
    symbol,
    tradeDate: null,
    beta1YDaily: { action: 'skipped_no_trade_date' },
    beta2YWeekly: { action: 'skipped_no_trade_date' },
    beta5YMonthly: { action: 'skipped_no_trade_date' },
  };

  const fiveYearsBack = subtractYears(date ?? new Date(), 5);

  const [stockRows, indexRows, stockRangeRows] = await Promise.all([
    date
      ? twseExportPrisma.$queryRaw<RawDailyPriceCloseRow[]>`
          SELECT trade_date, close FROM "export"."daily_price"
          WHERE symbol = ${symbol} AND trade_date >= ${fiveYearsBack} AND trade_date <= ${date}
          ORDER BY trade_date ASC
        `
      : twseExportPrisma.$queryRaw<RawDailyPriceCloseRow[]>`
          SELECT trade_date, close FROM "export"."daily_price"
          WHERE symbol = ${symbol} AND trade_date >= ${fiveYearsBack}
          ORDER BY trade_date ASC
        `,
    date
      ? twseExportPrisma.$queryRaw<RawDailyPriceCloseRow[]>`
          SELECT trade_date, close FROM "export"."daily_taiex_index"
          WHERE trade_date >= ${fiveYearsBack} AND trade_date <= ${date}
          ORDER BY trade_date ASC
        `
      : twseExportPrisma.$queryRaw<RawDailyPriceCloseRow[]>`
          SELECT trade_date, close FROM "export"."daily_taiex_index"
          WHERE trade_date >= ${fiveYearsBack}
          ORDER BY trade_date ASC
        `,
    twseExportPrisma.$queryRaw<RawDateRangeRow[]>`SELECT MIN(trade_date) AS min_date FROM "export"."daily_price" WHERE symbol = ${symbol}`,
  ]);

  if (stockRangeRows[0]?.min_date === null || stockRangeRows[0] === undefined) return skippedNoTradeDate;

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

  if (overlap.length === 0) return skippedNoTradeDate;

  const effectiveAsOf = overlap[overlap.length - 1]!.tradeDate;
  const effectiveAsOfDate = new Date(`${effectiveAsOf}T00:00:00.000Z`);
  const fiscalYear = effectiveAsOfDate.getUTCFullYear();
  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(effectiveAsOfDate);

  const coordinateFor = (lookbackRange: LookbackRange, samplingInterval: SamplingInterval) => ({
    symbol,
    metricCode: 'beta',
    ...rollingWindowGroup(lookbackRange, samplingInterval),
    fiscalYear,
    fiscalQuarter: DAILY_CADENCE_FISCAL_QUARTER,
    dataType,
    subsidiaryCompanyId,
    tradeDate: effectiveAsOfDate,
  });

  const outcomes = {} as Record<BetaWindowConfig['outputKey'], BasisOutcome>;
  for (const config of WINDOW_CONFIGS) {
    const { value, nullReason } = computeWindow(overlap, effectiveAsOfDate, config);
    outcomes[config.outputKey] = await writeMetricValue({
      ...coordinateFor(config.lookbackRange, config.samplingInterval),
      value,
      nullReason,
      knowledgeDate,
      knowledgeDateIsFallback: false,
    });
  }

  return {
    symbol,
    tradeDate: effectiveAsOf,
    beta1YDaily: outcomes.beta1YDaily,
    beta2YWeekly: outcomes.beta2YWeekly,
    beta5YMonthly: outcomes.beta5YMonthly,
  };
};
