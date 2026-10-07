import type { AppDeps } from '@/application/deps';
import { getMetricHistory } from '@/application/metrics/shared/queryMetricHistory';
import { restatePerShareHistory } from '@/application/metrics/shared/restatePerShareHistory';
import type { PeriodType } from '@/domain/metrics/metricBasis';
import { adjustForBasisChanges, dedupeByTradeDate, type DailyClose } from '@/domain/metrics/valuation/fiftyTwoWeek/calculateFiftyTwoWeek';
import { subtractYears } from '@/domain/metrics/valuation/beta/calculateBeta';
import { calculateValuationRiver } from '@/domain/market/calculateValuationRiver';

// 2026-10-08 本益比／淨值比／股價營收比河流圖（GET /companies/valuation-river）。web-nuxt 原本自己拿 stockPrice ÷ bvps 畫，跟淨值比對不起來
// （歷史端點的每股數字換算到今天股數基準、股價沒換算）；使用者要「最專業」的算法並拍板由後端算好。純計算見 calculateValuationRiver.ts。
// - 股價：每日收盤（上市＋上櫃、轉板同日上市優先），依 getShareBasisEvents 的 shareChange（市場實際除權／換發／恢復交易日）換算到今天的股數基準，
//   跟 52 週指標同一套；現金股利不換算（除息日的下跌照畫，跟下單軟體一致）。
// - 每股基準：跟 GET /companies/metric-history 顯示的同一個數字（getMetricHistory ＋ restatePerShareHistory），在 knowledgeDate（公告日）起生效。
// ponytail: 股價換算依除權日、每股基準換算依股本登記月（restatePerShareHistory），除權到登記之間剛好跨季底時那一季比值會短暫落差；
//   要完全一致再把每股基準也改用 getShareBasisEvents 換算。每次請求即時算、沒有快取，被大量呼叫時再加。
export type ValuationRiverRatio = 'pe' | 'pb' | 'ps';

const BASE_METRIC: Record<ValuationRiverRatio, { metricCode: string; periodType: PeriodType; label: string }> = {
  pe: { metricCode: 'eps', periodType: 'TTM', label: '近四季每股盈餘（eps.TTM）' },
  pb: { metricCode: 'bvps', periodType: 'Q', label: '最近一季每股淨值（bvps.Q）' },
  ps: { metricCode: 'revenuePerShare', periodType: 'TTM', label: '近四季每股營收（revenuePerShare.TTM）' },
};

const HISTORY_QUARTERS = 100; // 全部歷史（2020Q3 起約 24 季），窗口外的前一季也要拿到，窗口起點才有基準

export interface ValuationRiverQuery {
  symbol: string;
  ratio: ValuationRiverRatio;
  lookbackYears: number;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// 查無公告日（knowledgeDate 是季底頂替）時改用法定申報期限：Q1 5/15、Q2 8/14、Q3 11/14、Q4（年報）隔年 3/31。用季底會在公布前就套用新財報，偷看未來。
// ponytail: 金融業、興櫃的期限不同（例如銀行半年報 8/31），一律用一般業期限；只影響查無公告日的少數列。
const statutoryDeadline = (fiscalYear: number, fiscalQuarter: number | null): Date =>
  fiscalQuarter === 1 ? new Date(Date.UTC(fiscalYear, 4, 15)) : fiscalQuarter === 2 ? new Date(Date.UTC(fiscalYear, 7, 14)) : fiscalQuarter === 3 ? new Date(Date.UTC(fiscalYear, 10, 14)) : new Date(Date.UTC(fiscalYear + 1, 2, 31));

export const getCompanyValuationRiver = async ({ symbol, ratio, lookbackYears }: ValuationRiverQuery, deps: Pick<AppDeps, 'market' | 'shares' | 'metricValueQueries' | 'reportAvailability'>) => {
  const today = new Date();
  const windowStart = subtractYears(today, lookbackYears);
  const { metricCode, periodType, label } = BASE_METRIC[ratio];

  const [rows, { events }, dataType] = await Promise.all([
    deps.market.listDailyClosesSince(symbol, windowStart, today),
    deps.shares.getShareBasisEvents(symbol, windowStart, today),
    deps.reportAvailability.resolveDataType(symbol),
  ]);
  const raw: DailyClose[] = dedupeByTradeDate(rows.flatMap((r) => (r.close === null ? [] : [{ tradeDate: r.trade_date, close: Number(r.close) }])));
  const closes = adjustForBasisChanges(
    raw,
    events.flatMap((e) => (e.kind === 'shareChange' ? [{ date: e.date, multiplier: e.multiplier }] : []))
  );

  const { entries } = await getMetricHistory(symbol, metricCode, periodType, dataType, '', HISTORY_QUARTERS, deps);
  const restated = await restatePerShareHistory(symbol, metricCode, periodType, entries, deps);
  const basesAsc = restated
    .map((e) => ({ effectiveFrom: e.knowledgeDateIsFallback ? statutoryDeadline(e.fiscalYear, e.fiscalQuarter) : new Date(`${e.knowledgeDate}T00:00:00.000Z`), base: e.value, fiscalYear: e.fiscalYear, fiscalQuarter: e.fiscalQuarter, knowledgeDateIsFallback: e.knowledgeDateIsFallback }))
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  const result = calculateValuationRiver(closes, basesAsc);
  // 回傳窗口內生效的基準，加上窗口起點當下適用的那一筆（不然前端畫不出窗口第一段）。
  const firstInWindow = basesAsc.findIndex((b) => b.effectiveFrom > (closes[0]?.tradeDate ?? windowStart));
  const visibleBases = firstInWindow === -1 ? basesAsc.slice(-1) : basesAsc.slice(Math.max(0, firstInWindow - 1));

  return {
    symbol,
    ratio,
    basisNote:
      `帶狀 = 每股基準 × 倍數；每股基準是${label}，在財報公告日起生效（季底到公告日之間沿用上一份財報）。` +
      '股價與每股基準都換算到今天的股數基準（分割、配股、股數合併式減資），現金股利不換算。基準 ≤ 0（例如近四季虧損）的期間沒有比值，不計入倍數。',
    lookback: { requestedYears: lookbackYears, from: closes[0] ? day(closes[0].tradeDate) : null, to: closes.at(-1) ? day(closes.at(-1)!.tradeDate) : null },
    sampleDays: result.sampleDays,
    multiples: result.multiples,
    ratioRange: result.ratioRange,
    current: result.current && { ...result.current, tradeDate: day(result.current.tradeDate) },
    prices: closes.map((c) => ({ tradeDate: day(c.tradeDate), close: Math.round(c.close * 100) / 100 })),
    bases: visibleBases.map((b) => ({ effectiveFrom: day(b.effectiveFrom), base: b.base, fiscalYear: b.fiscalYear, fiscalQuarter: b.fiscalQuarter, knowledgeDateIsFallback: b.knowledgeDateIsFallback })),
  };
};
