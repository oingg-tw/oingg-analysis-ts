import { calculateExchangePeRatio } from '@/domain/metrics/valuation/exchangePeRatio/calculateExchangePeRatio';
import { calculateExchangePbRatio } from '@/domain/metrics/valuation/exchangePbRatio/calculateExchangePbRatio';
import { calculateDividendYield } from '@/domain/metrics/dividend/dividendYield/calculateDividendYield';
import { TWSE_BLANK_DIVIDEND_YIELD_MEANS_ZERO_FROM } from '@/domain/market/twseDividendYield';
import type { DailyValuationAsOf } from '@/application/ports/marketData';
import type { MetricProvenanceResult, ProvenanceEntry } from '../provenance/provenanceTypes';
import type { MarketRatiosDeps } from './computeMarketRatios';

// 2026-10-01 補溯源表（使用者：「溯源表請務必都加上」）。三支都是交易所每日公告值的 passthrough（見 computeMarketRatios.ts
// 檔頭），溯源表能給的就是「交易所公告的那個數字＋當天收盤價」：用 asOfDate 定位（該日或之前最近一筆；不給就是最新），
// 跟寫入時同一支 getDailyValuation、同一支 calculateXxx，value 就是寫進 metric_daily_cadence_values 的值。
// 三支形狀一樣，用一個工廠產生（比照 getEpsCagrProvenanceForYears 的 dispatch 慣例），不拆三個幾乎相同的檔案。
type MarketRatioCode = 'exchangePeRatio' | 'exchangePbRatio' | 'dividendYield';

const SPEC: Record<MarketRatioCode, { label: string; pick: (v: DailyValuationAsOf) => number | null; calc: (raw: number | null) => { value: number | null }; note: string }> = {
  exchangePeRatio: {
    label: '本益比',
    pick: (v) => v.peRatio,
    calc: calculateExchangePeRatio,
    note: '交易所公告的本益比＝收盤價 ÷ 交易所採用的每股盈餘，每股盈餘只在新財報公布時更新；不另外重算，原樣呈現。近四季虧損時交易所不公告（空白），本表為 null。',
  },
  exchangePbRatio: {
    label: '股價淨值比',
    pick: (v) => v.pbRatio,
    calc: calculateExchangePbRatio,
    note: '交易所公告的股價淨值比＝收盤價 ÷ 交易所採用的每股淨值，每股淨值只在新財報公布時更新；不另外重算，原樣呈現。',
  },
  dividendYield: {
    label: '殖利率（%）',
    pick: (v) => v.dividendYield,
    calc: calculateDividendYield,
    note: '交易所公告的殖利率＝每股股利 ÷ 收盤價 × 100，不另外重算，原樣呈現。',
  },
};

const toDateString = (d: Date): string => d.toISOString().slice(0, 10);

export const getMarketRatioProvenanceFor =
  (metricCode: MarketRatioCode, deps: MarketRatiosDeps) =>
  async (query: { symbol: string; asOfDate?: Date | undefined }): Promise<MetricProvenanceResult> => {
    const { symbol } = query;
    const spec = SPEC[metricCode];
    const valuation = await deps.market.getDailyValuation(symbol, query.asOfDate);
    if (!valuation) return { symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };

    const tradeDate = toDateString(valuation.tradeDate);
    const value = spec.calc(spec.pick(valuation)).value;
    const price = await deps.market.getStockPrice(symbol, valuation.tradeDate);

    const entries: ProvenanceEntry[] = [
      {
        role: `交易所公告${spec.label}（${tradeDate}）`,
        fiscalYear: null,
        fiscalQuarter: null,
        type: 'other',
        statementType: null,
        fieldKey: null,
        sourceDescription: `臺灣證券交易所／櫃買中心每日本益比、殖利率及股價淨值比（交易日 ${tradeDate}）`,
        value,
      },
      {
        role: `收盤價（${price?.tradeDate ?? tradeDate}）`,
        fiscalYear: null,
        fiscalQuarter: null,
        type: 'other',
        statementType: null,
        fieldKey: null,
        sourceDescription: '證交所／櫃買中心每日收盤價',
        value: price?.closePrice ?? null,
      },
    ];

    // 2026-08-28 起證交所把沒配息的殖利率改成空白，上市這側空白當 0（domain/market/twseDividendYield.ts）；port 已經換算過，
    // 這裡分不出 0 是交易所原值還是空白換來的，所以只在「日期在改版後且值為 0」時把規則講清楚。
    const blankRule =
      metricCode === 'dividendYield' && value === 0 && valuation.tradeDate >= TWSE_BLANK_DIVIDEND_YIELD_MEANS_ZERO_FROM
        ? `證交所自 ${toDateString(TWSE_BLANK_DIVIDEND_YIELD_MEANS_ZERO_FROM)} 起把沒配息公司的殖利率從 0.00 改成空白；改版前 2005 年起整條序列沒配息一律是 0.00，所以上市公司這段期間的空白一律視為 0，跟上櫃（仍公告 0）口徑一致。`
        : '';

    return { symbol, metricCode, found: true, fiscalYear: null, fiscalQuarter: null, value, entries, methodologyNote: spec.note + blankRule };
  };
