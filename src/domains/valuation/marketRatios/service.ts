import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getDailyValuationAsOf } from '@/shared/twseMarketData';
import type { MarketRatiosQuery, MarketRatiosResult } from './types';

export const calculateMarketRatios = async (query: MarketRatiosQuery): Promise<MarketRatiosResult> => {
  const { companyId, date } = query;
  const warnings: string[] = [];

  const asOfDate = date ? new Date(`${date}T00:00:00.000Z`) : undefined;

  const valuation = await getDailyValuationAsOf(companyId, asOfDate);

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
        where: { symbol_tradeDate: { symbol: companyId, tradeDate } },
        create: { symbol: companyId, tradeDate, peRatio, pbRatio, dividendYieldPct, warnings },
        update: { peRatio, pbRatio, dividendYieldPct, warnings },
      });
    } catch (error) {
      console.error('[market-ratios]: 寫入 valuation_market_ratios 失敗，不影響本次回傳結果。', error);
    }
  }

  return {
    companyId,
    tradeDate: tradeDate?.toISOString().slice(0, 10) ?? null,
    peRatio,
    pbRatio,
    dividendYieldPct,
    warnings,
  };
};
