import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateRevenuePerShare } from '@/domainBatch/metrics/profitability/revenuePerShare/service';
import { getMarketCapAsOf, hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { getPriceAnchorDate } from '@/shared/sourceData/reportAnnouncementDate';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { Season } from '@/shared/rocQuarter';
import type { PsrQuery, PsrResult } from './types';

// 市值是「股價 x 實際股數」的真實新台幣金額，但營收欄位（operatingRevenue）單位是千元——
// 分母要先 x1000 換算成同一個單位再除，不然會差 1000 倍，這是 BVPS/Altman X4 都踩過的同一個坑。
const toMultiple = (marketCap: number, revenueInThousands: bigint): number | null => {
  const denominator = Number(revenueInThousands) * 1000;
  if (denominator === 0) return null;
  return Math.round((marketCap / denominator) * 100) / 100;
};

const resolveQuarter = async (
  companyId: string,
  dataType: string,
  subsidiaryCompanyId: string,
  year: string | undefined,
  season: Season | undefined
): Promise<{ year: string; season: Season } | null> => {
  if (year !== undefined && season !== undefined) return { year, season };
  return getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['incomeStatement']);
};

export const calculatePsr = async (query: PsrQuery): Promise<PsrResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  const emptyResult = (year: string | null, season: Season | null, statuses: Array<[string, MetricStatus]>): PsrResult => ({
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: null,
    psrQuarterlyAnnualized: null,
    psrTtm: null,
    marketCap: { value: null, tradeDate: null, priceAnchorSource: null },
    operatingRevenue: { value: null },
    operatingRevenueTtm: { value: null },
    ttm: { quartersUsed: [], quartersMissing: [] },
    fieldStatuses: buildFieldStatuses(statuses),
    warnings,
  });

  const resolvedQuarter = await resolveQuarter(companyId, dataType, subsidiaryCompanyId, query.year, query.season);
  if (!resolvedQuarter) {
    warnings.push('查無任何一季的損益表資料，無法決定要用哪一季計算 PSR。');
    const noData: MetricStatus = { status: 'no_data', message: '查無任何一季的損益表資料。' };
    return emptyResult(null, null, [
      ['psrQuarterlyAnnualized', noData],
      ['psrTtm', noData],
    ]);
  }

  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const composedQuery = { companyId, year, season, dataType, subsidiaryCompanyId };

  // 營收（單季、TTM）直接引用 revenuePerShare 已經算好的數字，不重複實作損益表查詢/TTM 加總邏輯——
  // 跟 altmanZScore 引用 turnoverRatio 同一種模式。副作用是 revenuePerShare 也會照常把自己的
  // 結果 upsert 進 profitability_revenue_per_share，是預期行為。
  const revenueResult = await calculateRevenuePerShare(composedQuery);
  const operatingRevenue = revenueResult.operatingRevenue.value !== null ? BigInt(revenueResult.operatingRevenue.value) : null;
  const operatingRevenueTtm = revenueResult.operatingRevenueTtm.value !== null ? BigInt(revenueResult.operatingRevenueTtm.value) : null;
  if (operatingRevenue === null) warnings.push('本季營收缺漏（詳見 revenuePerShare 服務的 warnings），無法計算單季年化 PSR。');
  if (operatingRevenueTtm === null) warnings.push('近四季營收不齊（詳見 revenuePerShare 服務的 warnings），無法計算 TTM PSR。');

  const reportDate = revenueResult.reportDate ? new Date(`${revenueResult.reportDate}T00:00:00.000Z`) : null;

  // 股價基準要用「市場真正知道這季財報的那天」（財報公告日），不是財報期末日，避免 look-ahead
  // bias——見 shared/sourceData/reportAnnouncementDate.ts 的說明，跟 altmanZScore 的 X4 同一套邏輯。
  const priceAnchor = await getPriceAnchorDate(companyId, yearNum, seasonNum, reportDate);
  let marketCapValue: number | null = null;
  let marketCapTradeDate: string | null = null;
  if (priceAnchor) {
    if (priceAnchor.source === 'report_date_fallback') {
      warnings.push(
        `查無 ${year}Q${season} 的財報公告日（financial_report_announcement 覆蓋率會持續成長），市值改用財報期末日（${priceAnchor.date.toISOString().slice(0, 10)}）估算，可能有 look-ahead bias——市場實際上要到公告日才知道這一季財報數字。`
      );
    }
    const marketCap = await getMarketCapAsOf(companyId, priceAnchor.date);
    if (marketCap) {
      marketCapValue = marketCap.marketCap;
      marketCapTradeDate = marketCap.tradeDate;
    } else {
      warnings.push(`查無 ${companyId} 在 ${priceAnchor.date.toISOString().slice(0, 10)} 或之前的股價/股本資料，PSR 無法計算，見 fieldStatuses。`);
    }
  }

  const psrQuarterlyAnnualized = marketCapValue !== null && operatingRevenue !== null ? toMultiple(marketCapValue, operatingRevenue * 4n) : null;
  const psrTtm = marketCapValue !== null && operatingRevenueTtm !== null ? toMultiple(marketCapValue, operatingRevenueTtm) : null;

  // 覆蓋率會持續成長（見 shared/sourceData/marketCap.ts 的說明），不要寫死特定公司代號判斷——現查這家公司
  // 在 oingg-twse daily_price 裡有沒有任何資料，用來區分是「這家公司結構性不在覆蓋範圍內」
  // （not_applicable）還是「有覆蓋，這次查詢缺別的東西」（no_data）。
  const stockPriceCovered = marketCapValue === null ? await hasStockPriceCoverage(companyId) : true;
  const marketCapMissingStatus: MetricStatus = stockPriceCovered
    ? { status: 'no_data', message: '市值缺漏（股價或股本資料查無），無法計算 PSR。' }
    : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    psrQuarterlyAnnualized === null
      ? ['psrQuarterlyAnnualized', marketCapValue === null ? marketCapMissingStatus : { status: 'no_data', message: '本季營收缺漏，無法計算單季年化 PSR。' }]
      : null,
    psrTtm === null ? ['psrTtm', marketCapValue === null ? marketCapMissingStatus : { status: 'no_data', message: '近四季營收不齊，無法計算 TTM PSR。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 valuation_psr，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.psrResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, season: seasonNum, dataType, subsidiaryCompanyId },
      },
      create: {
        symbol: companyId,
        year: yearNum,
        season: seasonNum,
        dataType,
        subsidiaryCompanyId,
        reportDate,
        psrQuarterlyAnnualized,
        psrTtm,
        marketCapValue,
        marketCapTradeDate: marketCapTradeDate ? new Date(`${marketCapTradeDate}T00:00:00.000Z`) : null,
        operatingRevenueValue: operatingRevenue,
        operatingRevenueTtmValue: operatingRevenueTtm,
        warnings,
      },
      update: {
        reportDate,
        psrQuarterlyAnnualized,
        psrTtm,
        marketCapValue,
        marketCapTradeDate: marketCapTradeDate ? new Date(`${marketCapTradeDate}T00:00:00.000Z`) : null,
        operatingRevenueValue: operatingRevenue,
        operatingRevenueTtmValue: operatingRevenueTtm,
        warnings,
      },
    });
  } catch (error) {
    console.error('[psr]: 寫入 valuation_psr 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate ? reportDate.toISOString().slice(0, 10) : null,
    psrQuarterlyAnnualized,
    psrTtm,
    marketCap: { value: marketCapValue, tradeDate: marketCapTradeDate, priceAnchorSource: priceAnchor?.source ?? null },
    operatingRevenue: { value: operatingRevenue?.toString() ?? null },
    operatingRevenueTtm: { value: operatingRevenueTtm?.toString() ?? null },
    ttm: { quartersUsed: revenueResult.ttm.quartersUsed, quartersMissing: revenueResult.ttm.quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
