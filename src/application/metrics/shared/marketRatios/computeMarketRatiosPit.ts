import { getDailyValuationAsOf } from '@/infrastructure/repositories/exchange/twseMarketData';
import { resolveDailyCadenceKnowledgeDate } from '../../knowledgeDate';
import { writeMetricValue, type MetricValueWriteOutcome, snapshotCadenceGroup } from '../../metricValueWriter';
import { calculateExchangePeRatio } from '@/domain/metrics/valuation/exchangePeRatio/calculateExchangePeRatio';
import { calculateExchangePbRatio } from '@/domain/metrics/valuation/exchangePbRatio/calculateExchangePbRatio';
import { calculateDividendYield } from '@/domain/metrics/dividend/dividendYield/calculateDividendYield';

// MarketRatios（本益比/股價淨值比/殖利率）遷入 pitMetrics 的方法論決策見
// metricDefinitionRegistry.ts 頂部說明：直接沿用 TWSE/TPEx 官方每日公布的權威數字
// passthrough，不自己重算——這三個數字是原始市場觀察值（跟 stockPrice 同類），不是
// 從財報衍生出來的比率，所以這支檔案不做任何計算，純粹把 getDailyValuationAsOf
// （src/domainMetrics/marketRatios.ts 現有在用的同一個查詢函式）的結果寫進
// metric_values，用 sentinel 值（DAILY_CADENCE_FISCAL_QUARTER=0）+ snapshotCadence='EOD' +
// resolveDailyCadenceKnowledgeDate（knowledgeDate = 交易日本身，isFallback 恆為 false）。
//
// metricCode 命名故意跟既有 pitMetrics 的 peRatio/pbRatio（自己拿 XBRL 算 EPS/BVPS，
// 只在季報知識時點更新一次）分開，避免撞名/混淆：exchangePeRatio/exchangePbRatio/
// dividendYield，三者都是這支檔案一次查詢寫出來的（跟 getDailyValuationAsOf 一次查詢
// 回傳三個欄位一致），放在 shared/ 是因為 dividendYield 屬於 dividend 分類、
// exchangePeRatio/exchangePbRatio 屬於 valuation 分類，橫跨兩個因子分類，物理上不拆檔案。
//
// 2026-09-09 起這三個 metricCode 寫進獨立的 metric_daily_cadence_values（不再跟季報型
// 指標共用 metric_values），tradeDate 是那張表真正的自然鍵（NOT NULL），不再需要
// fiscalYear/fiscalQuarter 這種假裝有意義的欄位。
//
// 沒有 quarter 概念，也沒有個體/合併財報那種 dataType/subsidiaryCompanyId 區分（這是
// 純市場數字，不是財報衍生）——呼叫端固定傳 dataType/subsidiaryCompanyId，跟其他市場
// 價格類指標（stockPrice 等）的既有慣例一致，只是純粹當成識別欄位帶過去，不影響查詢邏輯。
export interface MarketRatiosPitQuery {
  symbol: string;
  date?: Date; // 選填，不給就抓整張表最新一筆
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
}

type DailyOutcome = MetricValueWriteOutcome | { action: 'skipped_no_trade_date' };

export interface MarketRatiosPitOutcome {
  symbol: string;
  tradeDate: string | null;
  exchangePeRatio: DailyOutcome;
  exchangePbRatio: DailyOutcome;
  dividendYield: DailyOutcome;
}

export const computeAndWriteMarketRatiosPit = async (query: MarketRatiosPitQuery): Promise<MarketRatiosPitOutcome> => {
  const { symbol, date, dataType, subsidiaryCompanyId } = query;

  const valuation = await getDailyValuationAsOf(symbol, date);
  if (!valuation) {
    return {
      symbol,
      tradeDate: null,
      exchangePeRatio: { action: 'skipped_no_trade_date' },
      exchangePbRatio: { action: 'skipped_no_trade_date' },
      dividendYield: { action: 'skipped_no_trade_date' },
    };
  }

  const { tradeDate } = valuation;
  const { knowledgeDate } = resolveDailyCadenceKnowledgeDate(tradeDate);

  const coordinateFor = (metricCode: string) => ({
    symbol,
    metricCode,
    ...snapshotCadenceGroup('EOD'),
    dataType,
    subsidiaryCompanyId,
    tradeDate,
  });

  const exchangePeRatioCalc = calculateExchangePeRatio(valuation.peRatio);
  const exchangePbRatioCalc = calculateExchangePbRatio(valuation.pbRatio);
  const dividendYieldCalc = calculateDividendYield(valuation.dividendYield);

  const exchangePeRatio = await writeMetricValue({
    ...coordinateFor('exchangePeRatio'),
    value: exchangePeRatioCalc.value,
    nullReason: exchangePeRatioCalc.nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });
  const exchangePbRatio = await writeMetricValue({
    ...coordinateFor('exchangePbRatio'),
    value: exchangePbRatioCalc.value,
    nullReason: exchangePbRatioCalc.nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });
  const dividendYield = await writeMetricValue({
    ...coordinateFor('dividendYield'),
    value: dividendYieldCalc.value,
    nullReason: dividendYieldCalc.nullReason,
    knowledgeDate,
    knowledgeDateIsFallback: false,
  });

  return { symbol, tradeDate: tradeDate.toISOString().slice(0, 10), exchangePeRatio, exchangePbRatio, dividendYield };
};
