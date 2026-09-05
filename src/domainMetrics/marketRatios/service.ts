import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus, type MetricResultMeta } from '@/shared/metricStatus';
import { getDailyValuationAsOf } from '@/shared/sourceData/twseMarketData';
import { logger } from '@/shared/logger';

export interface MarketRatiosQuery {
  symbol: string;
  // 選填，格式 YYYY-MM-DD；不給就抓最新一筆。這不是財務季度查詢——PER/PBR 是逐日市場資料，
  // 跟其他指標的 year/season 查詢介面不是同一種時間刻度，刻意不套用那套模板。
  date?: string;
}

export interface MarketRatiosResult extends MetricResultMeta {
  symbol: string;
  // 實際套用的交易日——有指定 date 時，是「該日期或之前」最新一筆；沒指定就是整張表最新一筆。
  tradeDate: string | null;

  // 以下三個數值直接來自 oingg-twse 的 daily_valuation 表，本服務沒有自己重算，
  // 也不知道對方 EPS 用的是單季、TTM 還是年度口徑——是外部黑盒數字，
  // 跟本服務自己算的 EPS（src/domainMetrics/eps/）、BVPS 口徑不保證一致，
  // 兩者不要直接拿來互相驗證或混用。
  peRatio: number | null;
  pbRatio: number | null;
  dividendYieldPct: number | null;
}

export const calculateMarketRatios = async (query: MarketRatiosQuery): Promise<MarketRatiosResult> => {
  const { symbol, date } = query;
  const warnings: string[] = [];

  const asOfDate = date ? new Date(`${date}T00:00:00.000Z`) : undefined;

  const valuation = await getDailyValuationAsOf(symbol, asOfDate);

  let peRatio: number | null = null;
  let pbRatio: number | null = null;
  let dividendYieldPct: number | null = null;
  let tradeDate: Date | null = null;

  if (valuation) {
    peRatio = valuation.peRatio;
    pbRatio = valuation.pbRatio;
    dividendYieldPct = valuation.dividendYield;
    tradeDate = valuation.tradeDate;
    if (peRatio === null) warnings.push('oingg-twse 該交易日的 PER 欄位為 null（可能是虧損等無法計算 PER 的情況）。');
    if (pbRatio === null) warnings.push('oingg-twse 該交易日的 PBR 欄位為 null。');
    if (dividendYieldPct === null) warnings.push('oingg-twse 該交易日的殖利率欄位為 null。');
  } else if (asOfDate) {
    warnings.push('查無指定日期或之前的股價/估值資料（oingg-twse daily_valuation），無法計算 PER/PBR/殖利率。');
  } else {
    warnings.push('查無該公司的股價/估值資料（oingg-twse daily_valuation），無法計算 PER/PBR/殖利率。');
  }

  warnings.push(
    'peRatio/pbRatio/dividendYieldPct 直接來自 oingg-twse 的 daily_valuation，本服務沒有自己重算，對方 EPS 用的是單季/TTM/年度哪種口徑並不清楚，跟本服務自己算的 EPS/BVPS 口徑不保證一致。'
  );

  // 存進 oingg-analysis DB 的 valuation_market_ratios，用 symbol+tradeDate 當 key（不是財務季度）。
  // 存檔失敗不應該讓已經查好的結果回傳失敗；如果連交易日都查不到（tradeDate 是 null）就沒有 key 可以存，直接跳過。
  if (tradeDate) {
    try {
      await analysisPrisma.marketRatiosResult.upsert({
        where: { symbol_tradeDate: { symbol: symbol, tradeDate } },
        create: { symbol: symbol, tradeDate, peRatio, pbRatio, dividendYieldPct, warnings },
        update: { peRatio, pbRatio, dividendYieldPct, warnings },
      });
    } catch (error) {
      logger.error({ err: error }, '[market-ratios]: 寫入 valuation_market_ratios 失敗，不影響本次回傳結果。');
    }
  }

  // valuation 查得到但個別欄位是 null，是「這天的估值資料本身沒有這個數字」（常見於虧損公司沒有
  // PER 這種結構性原因），不是「還沒查到」；valuation 整筆查不到（tradeDate 是 null）才是真的
  // no_data——兩種情況要分開標記，見各自 message。
  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    peRatio === null
      ? tradeDate === null
        ? ['peRatio', { status: 'no_data', message: '查無股價/估值資料（oingg-twse daily_valuation）。' }]
        : ['peRatio', { status: 'not_applicable', message: 'oingg-twse 該交易日的 PER 欄位為 null，可能是虧損等無法計算 PER 的情況。' }]
      : null,
    pbRatio === null
      ? tradeDate === null
        ? ['pbRatio', { status: 'no_data', message: '查無股價/估值資料（oingg-twse daily_valuation）。' }]
        : ['pbRatio', { status: 'not_applicable', message: 'oingg-twse 該交易日的 PBR 欄位為 null。' }]
      : null,
    dividendYieldPct === null
      ? tradeDate === null
        ? ['dividendYieldPct', { status: 'no_data', message: '查無股價/估值資料（oingg-twse daily_valuation）。' }]
        : ['dividendYieldPct', { status: 'not_applicable', message: 'oingg-twse 該交易日的殖利率欄位為 null。' }]
      : null,
  ];

  return {
    symbol,
    tradeDate: tradeDate?.toISOString().slice(0, 10) ?? null,
    peRatio,
    pbRatio,
    dividendYieldPct,
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
