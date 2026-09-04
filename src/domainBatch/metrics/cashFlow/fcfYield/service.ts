import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateCashFlowPerShare } from '@/domainBatch/metrics/cashFlow/cashFlowPerShare/service';
import { getStockPriceAsOf, hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { getPriceAnchorDate } from '@/shared/sourceData/reportAnnouncementDate';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { Season } from '@/shared/rocQuarter';
import type { FcfYieldQuery, FcfYieldResult } from './types';

// 兩者都已經是「每股」金額（元），單位一致，不用像 PSR/P_FCF/EV_EBITDA 那樣處理千元/元的換算。
const toPct = (fcfPerShare: number, stockPrice: number): number | null => {
  if (stockPrice === 0) return null;
  return Math.round((fcfPerShare / stockPrice) * 100 * 100) / 100;
};

const resolveQuarter = async (
  symbol: string,
  dataType: string,
  subsidiaryCompanyId: string,
  year: string | undefined,
  season: Season | undefined
): Promise<{ year: string; season: Season } | null> => {
  if (year !== undefined && season !== undefined) return { year, season };
  return getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);
};

export const calculateFcfYield = async (query: FcfYieldQuery): Promise<FcfYieldResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  const emptyResult = (year: string | null, season: Season | null, statuses: Array<[string, MetricStatus]>): FcfYieldResult => ({
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: null,
    fcfYieldQuarterlyAnnualizedPct: null,
    fcfYieldTtmPct: null,
    stockPrice: { value: null, tradeDate: null, priceAnchorSource: null },
    fcfPerShareQuarterlyAnnualized: null,
    fcfPerShareTtm: null,
    ttm: { quartersUsed: [], quartersMissing: [] },
    fieldStatuses: buildFieldStatuses(statuses),
    warnings,
  });

  const resolvedQuarter = await resolveQuarter(symbol, dataType, subsidiaryCompanyId, query.year, query.season);
  if (!resolvedQuarter) {
    warnings.push('查無任何一季的現金流量表資料，無法決定要用哪一季計算 FCF_Yield。');
    const noData: MetricStatus = { status: 'no_data', message: '查無任何一季的現金流量表資料。' };
    return emptyResult(null, null, [
      ['fcfYieldQuarterlyAnnualizedPct', noData],
      ['fcfYieldTtmPct', noData],
    ]);
  }

  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const composedQuery = { symbol, year, season, dataType, subsidiaryCompanyId };

  // 每股 FCF（單季年化、TTM）直接引用 cashFlowPerShare 已經算好的數字，不重複查詢——
  // 跟 valuation/pFcf/ 同一種模式，只是這裡分母是股價不是市值，不需要流通股數。
  const cashFlowResult = await calculateCashFlowPerShare(composedQuery);
  const fcfPerShareQuarterlyAnnualized = cashFlowResult.fcfPerShareQuarterlyAnnualized;
  const fcfPerShareTtm = cashFlowResult.fcfPerShareTtm;
  if (fcfPerShareQuarterlyAnnualized === null) warnings.push('本季每股自由現金流缺漏（詳見 cashFlowPerShare 服務的 warnings），無法計算單季年化 FCF_Yield。');
  if (fcfPerShareTtm === null) warnings.push('TTM 每股自由現金流缺漏（詳見 cashFlowPerShare 服務的 warnings），無法計算 TTM FCF_Yield。');

  const reportDate = cashFlowResult.reportDate ? new Date(`${cashFlowResult.reportDate}T00:00:00.000Z`) : null;

  // 股價基準要用「市場真正知道這季財報的那天」（財報公告日），不是財報期末日，避免 look-ahead
  // bias——見 shared/sourceData/reportAnnouncementDate.ts 的說明，跟 altmanZScore 的 X4 同一套邏輯。
  const priceAnchor = await getPriceAnchorDate(symbol, yearNum, seasonNum, reportDate);
  let stockPriceValue: number | null = null;
  let stockPriceTradeDate: string | null = null;
  if (priceAnchor) {
    if (priceAnchor.source === 'report_date_fallback') {
      warnings.push(
        `查無 ${year}Q${season} 的財報公告日（financial_report_announcement 覆蓋率會持續成長），股價改用財報期末日（${priceAnchor.date.toISOString().slice(0, 10)}）估算，可能有 look-ahead bias——市場實際上要到公告日才知道這一季財報數字。`
      );
    }
    const stockPrice = await getStockPriceAsOf(symbol, priceAnchor.date);
    if (stockPrice) {
      stockPriceValue = stockPrice.closePrice;
      stockPriceTradeDate = stockPrice.tradeDate;
    } else {
      warnings.push(`查無 ${symbol} 在 ${priceAnchor.date.toISOString().slice(0, 10)} 或之前的股價資料，FCF_Yield 無法計算，見 fieldStatuses。`);
    }
  }

  const fcfYieldQuarterlyAnnualizedPct =
    stockPriceValue !== null && fcfPerShareQuarterlyAnnualized !== null ? toPct(fcfPerShareQuarterlyAnnualized, stockPriceValue) : null;
  const fcfYieldTtmPct = stockPriceValue !== null && fcfPerShareTtm !== null ? toPct(fcfPerShareTtm, stockPriceValue) : null;

  // 覆蓋率會持續成長（見 shared/sourceData/marketCap.ts 的說明），不要寫死特定公司代號判斷——現查這家公司
  // 在 oingg-twse daily_price 裡有沒有任何資料，用來區分是「這家公司結構性不在覆蓋範圍內」
  // （not_applicable）還是「有覆蓋，這次查詢缺別的東西」（no_data）。
  const stockPriceCovered = stockPriceValue === null ? await hasStockPriceCoverage(symbol) : true;
  const stockPriceMissingStatus: MetricStatus = stockPriceCovered
    ? { status: 'no_data', message: '股價缺漏，無法計算 FCF_Yield。' }
    : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    fcfYieldQuarterlyAnnualizedPct === null
      ? [
          'fcfYieldQuarterlyAnnualizedPct',
          stockPriceValue === null ? stockPriceMissingStatus : { status: 'no_data', message: '本季每股自由現金流缺漏，無法計算單季年化 FCF_Yield。' },
        ]
      : null,
    fcfYieldTtmPct === null
      ? ['fcfYieldTtmPct', stockPriceValue === null ? stockPriceMissingStatus : { status: 'no_data', message: 'TTM 每股自由現金流缺漏，無法計算 TTM FCF_Yield。' }]
      : null,
  ];

  // 存進 oingg-analysis DB 的 cash_flow_fcf_yield，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.fcfYieldResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: symbol, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: symbol,
        year: yearNum,
        season: seasonNum,
        dataType,
        subsidiaryCompanyId,
        reportDate,
        fcfYieldQuarterlyAnnualizedPct,
        fcfYieldTtmPct,
        stockPriceValue,
        stockPriceTradeDate: stockPriceTradeDate ? new Date(`${stockPriceTradeDate}T00:00:00.000Z`) : null,
        warnings,
      },
      update: {
        reportDate,
        fcfYieldQuarterlyAnnualizedPct,
        fcfYieldTtmPct,
        stockPriceValue,
        stockPriceTradeDate: stockPriceTradeDate ? new Date(`${stockPriceTradeDate}T00:00:00.000Z`) : null,
        warnings,
      },
    });
  } catch (error) {
    console.error('[fcf-yield]: 寫入 cash_flow_fcf_yield 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate ? reportDate.toISOString().slice(0, 10) : null,
    fcfYieldQuarterlyAnnualizedPct,
    fcfYieldTtmPct,
    stockPrice: { value: stockPriceValue, tradeDate: stockPriceTradeDate, priceAnchorSource: priceAnchor?.source ?? null },
    fcfPerShareQuarterlyAnnualized,
    fcfPerShareTtm,
    ttm: { quartersUsed: cashFlowResult.ttm.quartersUsed, quartersMissing: cashFlowResult.ttm.quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
