import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateNetDebtToEbitda } from '@/domainBatch/metrics/solvency/netDebtToEbitda/service';
import { getMarketCapAsOf, hasStockPriceCoverage } from '@/shared/sourceData/marketCap';
import { getPriceAnchorDate } from '@/shared/sourceData/reportAnnouncementDate';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { Season } from '@/shared/rocQuarter';
import type { EvEbitdaQuery, EvEbitdaResult } from './types';

// 企業價值（元）是「市值 + 淨負債 x1000」算出來的真實新台幣金額，但 EBITDA 欄位單位是千元——
// 分母要先 x1000 換算成同一個單位再除，不然會差 1000 倍，這是 BVPS/Altman X4/PSR/P_FCF 都踩過的同一個坑。
const toMultiple = (enterpriseValue: number, ebitdaInThousands: bigint): number | null => {
  const denominator = Number(ebitdaInThousands) * 1000;
  if (denominator === 0) return null;
  return Math.round((enterpriseValue / denominator) * 100) / 100;
};

const resolveQuarter = async (
  symbol: string,
  dataType: string,
  subsidiaryCompanyId: string,
  year: string | undefined,
  season: Season | undefined
): Promise<{ year: string; season: Season } | null> => {
  if (year !== undefined && season !== undefined) return { year, season };
  return getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);
};

export const calculateEvEbitda = async (query: EvEbitdaQuery): Promise<EvEbitdaResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  const emptyResult = (year: string | null, season: Season | null, statuses: Array<[string, MetricStatus]>): EvEbitdaResult => ({
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: null,
    evToEbitdaQuarterlyAnnualized: null,
    evToEbitdaTtm: null,
    enterpriseValue: { value: null },
    marketCap: { value: null, tradeDate: null, priceAnchorSource: null },
    netDebt: { value: null },
    ebitdaQuarterly: { value: null },
    ebitdaTtm: { value: null },
    ttm: { quartersUsed: [], quartersMissing: [] },
    fieldStatuses: buildFieldStatuses(statuses),
    warnings,
  });

  const resolvedQuarter = await resolveQuarter(symbol, dataType, subsidiaryCompanyId, query.year, query.season);
  if (!resolvedQuarter) {
    warnings.push('查無任何一季資產負債表/損益表/現金流量表都有資料的季度，無法決定要用哪一季計算 EV_EBITDA。');
    const noData: MetricStatus = { status: 'no_data', message: '查無任何一季資產負債表/損益表/現金流量表都有資料的季度。' };
    return emptyResult(null, null, [
      ['evToEbitdaQuarterlyAnnualized', noData],
      ['evToEbitdaTtm', noData],
    ]);
  }

  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const composedQuery = { symbol, year, season, dataType, subsidiaryCompanyId };

  // 淨負債、EBITDA（單季、TTM）直接引用 netDebtToEbitda 已經算好的數字，不重複實作三張表查詢/
  // TTM 加總邏輯——跟 psr/、pFcf/ 同一種模式。副作用是 netDebtToEbitda 也會照常把自己的結果
  // upsert 進 solvency_net_debt_to_ebitda，是預期行為。
  const netDebtResult = await calculateNetDebtToEbitda(composedQuery);
  const netDebt = netDebtResult.netDebt.value !== null ? BigInt(netDebtResult.netDebt.value) : null;
  const ebitdaQuarterly = netDebtResult.ebitdaQuarterly.value !== null ? BigInt(netDebtResult.ebitdaQuarterly.value) : null;
  const ebitdaTtm = netDebtResult.ebitdaTtm.value !== null ? BigInt(netDebtResult.ebitdaTtm.value) : null;
  if (netDebt === null) warnings.push('本季淨負債缺漏（詳見 netDebtToEbitda 服務的 warnings），無法計算企業價值。');
  if (ebitdaQuarterly === null) warnings.push('本季 EBITDA 缺漏（詳見 netDebtToEbitda 服務的 warnings），無法計算單季年化 EV_EBITDA。');
  if (ebitdaTtm === null) warnings.push('近四季 EBITDA 不齊（詳見 netDebtToEbitda 服務的 warnings），無法計算 TTM EV_EBITDA。');

  const reportDate = netDebtResult.reportDate ? new Date(`${netDebtResult.reportDate}T00:00:00.000Z`) : null;

  // 股價基準要用「市場真正知道這季財報的那天」（財報公告日），不是財報期末日，避免 look-ahead
  // bias——見 shared/sourceData/reportAnnouncementDate.ts 的說明，跟 altmanZScore 的 X4 同一套邏輯。
  const priceAnchor = await getPriceAnchorDate(symbol, yearNum, seasonNum, reportDate);
  let marketCapValue: number | null = null;
  let marketCapTradeDate: string | null = null;
  if (priceAnchor) {
    if (priceAnchor.source === 'report_date_fallback') {
      warnings.push(
        `查無 ${year}Q${season} 的財報公告日（financial_report_announcement 覆蓋率會持續成長），市值改用財報期末日（${priceAnchor.date.toISOString().slice(0, 10)}）估算，可能有 look-ahead bias——市場實際上要到公告日才知道這一季財報數字。`
      );
    }
    const marketCap = await getMarketCapAsOf(symbol, priceAnchor.date);
    if (marketCap) {
      marketCapValue = marketCap.marketCap;
      marketCapTradeDate = marketCap.tradeDate;
    } else {
      warnings.push(`查無 ${symbol} 在 ${priceAnchor.date.toISOString().slice(0, 10)} 或之前的股價/股本資料，企業價值無法計算，見 fieldStatuses。`);
    }
  }

  const enterpriseValue = marketCapValue !== null && netDebt !== null ? marketCapValue + Number(netDebt) * 1000 : null;

  const evToEbitdaQuarterlyAnnualized = enterpriseValue !== null && ebitdaQuarterly !== null ? toMultiple(enterpriseValue, ebitdaQuarterly * 4n) : null;
  const evToEbitdaTtm = enterpriseValue !== null && ebitdaTtm !== null ? toMultiple(enterpriseValue, ebitdaTtm) : null;

  // 覆蓋率會持續成長（見 shared/sourceData/marketCap.ts 的說明），不要寫死特定公司代號判斷——現查這家公司
  // 在 oingg-twse daily_price 裡有沒有任何資料，用來區分是「這家公司結構性不在覆蓋範圍內」
  // （not_applicable）還是「有覆蓋，這次查詢缺別的東西」（no_data）。
  const stockPriceCovered = marketCapValue === null ? await hasStockPriceCoverage(symbol) : true;
  const marketCapMissingStatus: MetricStatus = stockPriceCovered
    ? { status: 'no_data', message: '市值缺漏（股價或股本資料查無），無法計算企業價值。' }
    : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    enterpriseValue === null
      ? ['enterpriseValue', marketCapValue === null ? marketCapMissingStatus : { status: 'no_data', message: '淨負債缺漏，無法計算企業價值。' }]
      : null,
    evToEbitdaQuarterlyAnnualized === null
      ? [
          'evToEbitdaQuarterlyAnnualized',
          enterpriseValue === null ? marketCapMissingStatus : { status: 'no_data', message: '本季 EBITDA 缺漏，無法計算單季年化 EV_EBITDA。' },
        ]
      : null,
    evToEbitdaTtm === null
      ? ['evToEbitdaTtm', enterpriseValue === null ? marketCapMissingStatus : { status: 'no_data', message: '近四季 EBITDA 不齊，無法計算 TTM EV_EBITDA。' }]
      : null,
  ];

  // 存進 oingg-analysis DB 的 valuation_ev_ebitda，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.evEbitdaResult.upsert({
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
        evToEbitdaQuarterlyAnnualized,
        evToEbitdaTtm,
        enterpriseValue,
        marketCapValue,
        marketCapTradeDate: marketCapTradeDate ? new Date(`${marketCapTradeDate}T00:00:00.000Z`) : null,
        netDebtValue: netDebt,
        ebitdaQuarterlyValue: ebitdaQuarterly,
        ebitdaTtmValue: ebitdaTtm,
        warnings,
      },
      update: {
        reportDate,
        evToEbitdaQuarterlyAnnualized,
        evToEbitdaTtm,
        enterpriseValue,
        marketCapValue,
        marketCapTradeDate: marketCapTradeDate ? new Date(`${marketCapTradeDate}T00:00:00.000Z`) : null,
        netDebtValue: netDebt,
        ebitdaQuarterlyValue: ebitdaQuarterly,
        ebitdaTtmValue: ebitdaTtm,
        warnings,
      },
    });
  } catch (error) {
    console.error('[ev-ebitda]: 寫入 valuation_ev_ebitda 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate ? reportDate.toISOString().slice(0, 10) : null,
    evToEbitdaQuarterlyAnnualized,
    evToEbitdaTtm,
    enterpriseValue: { value: enterpriseValue },
    marketCap: { value: marketCapValue, tradeDate: marketCapTradeDate, priceAnchorSource: priceAnchor?.source ?? null },
    netDebt: { value: netDebt?.toString() ?? null },
    ebitdaQuarterly: { value: ebitdaQuarterly?.toString() ?? null },
    ebitdaTtm: { value: ebitdaTtm?.toString() ?? null },
    ttm: { quartersUsed: netDebtResult.ttm.quartersUsed, quartersMissing: netDebtResult.ttm.quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
