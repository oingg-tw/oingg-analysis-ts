import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { calculateCashFlowPerShare } from '@/domains/cashFlow/cashFlowPerShare/service';
import { getMarketCapAsOf, hasStockPriceCoverage } from '@/shared/marketCap';
import { getPriceAnchorDate } from '@/shared/reportAnnouncementDate';
import { getLatestAvailableQuarter } from '@/shared/latestQuarter';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { Season } from '@/shared/rocQuarter';
import type { PFcfQuery, PFcfResult } from './types';

// 市值是「股價 x 實際股數」的真實新台幣金額，但 FCF 欄位單位是千元——分母要先 x1000 換算成
// 同一個單位再除，不然會差 1000 倍，這是 BVPS/Altman X4/PSR 都踩過的同一個坑。
const toMultiple = (marketCap: number, fcfInThousands: bigint): number | null => {
  const denominator = Number(fcfInThousands) * 1000;
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
  return getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['cashFlowStatement']);
};

export const calculatePFcf = async (query: PFcfQuery): Promise<PFcfResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  const emptyResult = (year: string | null, season: Season | null, statuses: Array<[string, MetricStatus]>): PFcfResult => ({
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: null,
    pFcfQuarterlyAnnualized: null,
    pFcfTtm: null,
    marketCap: { value: null, tradeDate: null, priceAnchorSource: null },
    freeCashFlow: { value: null },
    freeCashFlowTtm: { value: null },
    ttm: { quartersUsed: [], quartersMissing: [] },
    fieldStatuses: buildFieldStatuses(statuses),
    warnings,
  });

  const resolvedQuarter = await resolveQuarter(companyId, dataType, subsidiaryCompanyId, query.year, query.season);
  if (!resolvedQuarter) {
    warnings.push('查無任何一季的現金流量表資料，無法決定要用哪一季計算 P_FCF。');
    const noData: MetricStatus = { status: 'no_data', message: '查無任何一季的現金流量表資料。' };
    return emptyResult(null, null, [
      ['pFcfQuarterlyAnnualized', noData],
      ['pFcfTtm', noData],
    ]);
  }

  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const composedQuery = { companyId, year, season, dataType, subsidiaryCompanyId };

  // FCF（單季、TTM）直接引用 cashFlowPerShare 已經算好的營業活動現金流量/資本支出，不重複實作
  // 現金流量表查詢/TTM 加總邏輯——跟 psr/ 引用 revenuePerShare 同一種模式。副作用是 cashFlowPerShare
  // 也會照常把自己的結果 upsert 進 cash_flow_per_share，是預期行為。
  const cashFlowResult = await calculateCashFlowPerShare(composedQuery);
  const operatingCashFlow = cashFlowResult.operatingCashFlow.value !== null ? BigInt(cashFlowResult.operatingCashFlow.value) : null;
  const capitalExpenditures = cashFlowResult.capitalExpenditures.value !== null ? BigInt(cashFlowResult.capitalExpenditures.value) : null;
  const operatingCashFlowTtm = cashFlowResult.operatingCashFlowTtm.value !== null ? BigInt(cashFlowResult.operatingCashFlowTtm.value) : null;
  const capitalExpendituresTtm = cashFlowResult.capitalExpendituresTtm.value !== null ? BigInt(cashFlowResult.capitalExpendituresTtm.value) : null;

  const freeCashFlow = operatingCashFlow !== null && capitalExpenditures !== null ? operatingCashFlow + capitalExpenditures : null;
  const freeCashFlowTtm = operatingCashFlowTtm !== null && capitalExpendituresTtm !== null ? operatingCashFlowTtm + capitalExpendituresTtm : null;
  if (freeCashFlow === null) warnings.push('本季營業活動現金流量或資本支出缺漏（詳見 cashFlowPerShare 服務的 warnings），無法計算單季年化 P_FCF。');
  if (freeCashFlowTtm === null) warnings.push('近四季現金流量資料不齊（詳見 cashFlowPerShare 服務的 warnings），無法計算 TTM P_FCF。');
  if (freeCashFlow !== null && freeCashFlow <= 0n) warnings.push('本季自由現金流為零或負數，P_FCF 數值意義有限（負值代表燒錢），請自行判斷是否採用。');

  const reportDate = cashFlowResult.reportDate ? new Date(`${cashFlowResult.reportDate}T00:00:00.000Z`) : null;

  // 股價基準要用「市場真正知道這季財報的那天」（財報公告日），不是財報期末日，避免 look-ahead
  // bias——見 shared/reportAnnouncementDate.ts 的說明，跟 altmanZScore 的 X4 同一套邏輯。
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
      warnings.push(`查無 ${companyId} 在 ${priceAnchor.date.toISOString().slice(0, 10)} 或之前的股價/股本資料，P_FCF 無法計算，見 fieldStatuses。`);
    }
  }

  const pFcfQuarterlyAnnualized = marketCapValue !== null && freeCashFlow !== null ? toMultiple(marketCapValue, freeCashFlow * 4n) : null;
  const pFcfTtm = marketCapValue !== null && freeCashFlowTtm !== null ? toMultiple(marketCapValue, freeCashFlowTtm) : null;

  // 覆蓋率會持續成長（見 shared/marketCap.ts 的說明），不要寫死特定公司代號判斷——現查這家公司
  // 在 oingg-twse daily_price 裡有沒有任何資料，用來區分是「這家公司結構性不在覆蓋範圍內」
  // （not_applicable）還是「有覆蓋，這次查詢缺別的東西」（no_data）。
  const stockPriceCovered = marketCapValue === null ? await hasStockPriceCoverage(companyId) : true;
  const marketCapMissingStatus: MetricStatus = stockPriceCovered
    ? { status: 'no_data', message: '市值缺漏（股價或股本資料查無），無法計算 P_FCF。' }
    : { status: 'not_applicable', message: 'daily_price 目前沒有這家公司的股價資料，這家公司不適用（不是資料還沒補齊，覆蓋率之後會持續成長）。' };

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    pFcfQuarterlyAnnualized === null
      ? [
          'pFcfQuarterlyAnnualized',
          marketCapValue === null ? marketCapMissingStatus : { status: 'no_data', message: '本季自由現金流缺漏，無法計算單季年化 P_FCF。' },
        ]
      : null,
    pFcfTtm === null ? ['pFcfTtm', marketCapValue === null ? marketCapMissingStatus : { status: 'no_data', message: '近四季自由現金流不齊，無法計算 TTM P_FCF。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 valuation_p_fcf，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.pFcfResult.upsert({
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
        pFcfQuarterlyAnnualized,
        pFcfTtm,
        marketCapValue,
        marketCapTradeDate: marketCapTradeDate ? new Date(`${marketCapTradeDate}T00:00:00.000Z`) : null,
        freeCashFlowValue: freeCashFlow,
        freeCashFlowTtmValue: freeCashFlowTtm,
        warnings,
      },
      update: {
        reportDate,
        pFcfQuarterlyAnnualized,
        pFcfTtm,
        marketCapValue,
        marketCapTradeDate: marketCapTradeDate ? new Date(`${marketCapTradeDate}T00:00:00.000Z`) : null,
        freeCashFlowValue: freeCashFlow,
        freeCashFlowTtmValue: freeCashFlowTtm,
        warnings,
      },
    });
  } catch (error) {
    console.error('[p-fcf]: 寫入 valuation_p_fcf 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate ? reportDate.toISOString().slice(0, 10) : null,
    pFcfQuarterlyAnnualized,
    pFcfTtm,
    marketCap: { value: marketCapValue, tradeDate: marketCapTradeDate, priceAnchorSource: priceAnchor?.source ?? null },
    freeCashFlow: { value: freeCashFlow?.toString() ?? null },
    freeCashFlowTtm: { value: freeCashFlowTtm?.toString() ?? null },
    ttm: { quartersUsed: cashFlowResult.ttm.quartersUsed, quartersMissing: cashFlowResult.ttm.quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
