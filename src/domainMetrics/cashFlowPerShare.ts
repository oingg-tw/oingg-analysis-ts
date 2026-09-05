import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus, type MetricResultMeta } from '@/shared/metricStatus';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyCashFlowStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';
import { logger } from '@/shared/logger';

// year/season 選填但要成對——不給就自動抓「這家公司現金流量表有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type CashFlowPerShareQuery = QuarterlyMetricQuery;

export interface CashFlowPerShareResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // OCF 每股營業現金流 = 本季營業活動現金流量 / 本季報告日對應的流通股數
  ocfPerShareQuarterly: number | null;
  ocfPerShareQuarterlyAnnualized: number | null;
  ocfPerShareTtm: number | null;

  // FCF 每股自由現金流 = (營業活動現金流量 + 資本支出) / 流通股數。
  // capitalExpenditures 在資料庫裡本來就是負數（現金流出），所以是加不是減。
  fcfPerShareQuarterly: number | null;
  fcfPerShareQuarterlyAnnualized: number | null;
  fcfPerShareTtm: number | null;

  operatingCashFlow: {
    value: string | null; // BigInt as string；本季 netCashFromOperatingActivities
  };
  operatingCashFlowTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  capitalExpenditures: {
    value: string | null; // BigInt as string；本季 capitalExpenditures（負數）
  };
  capitalExpendituresTtm: {
    value: string | null; // BigInt as string；近四季加總（負數），資料不齊則為 null
  };

  paidInShares: {
    value: string | null; // BigInt as string
    // 股本資料的生效年月（西元曆），是「實際套用的那筆股本紀錄生效於何時」，不是本季的民國年季。
    effectiveYear: number | null;
    effectiveMonth: number | null;
  };

  ttm: QuarterlyMetricTtmInfo;
}

// 財報金額欄位單位是「千元」，但流通股數是實際股數，不是千股，兩者單位不同，
// 分子要先換算成元（x1000）才能除，否則會差 1000 倍（BVPS 曾踩過這個坑）。
const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): CashFlowPerShareResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  ocfPerShareQuarterly: null,
  ocfPerShareQuarterlyAnnualized: null,
  ocfPerShareTtm: null,
  fcfPerShareQuarterly: null,
  fcfPerShareQuarterlyAnnualized: null,
  fcfPerShareTtm: null,
  operatingCashFlow: { value: null },
  operatingCashFlowTtm: { value: null },
  capitalExpenditures: { value: null },
  capitalExpendituresTtm: { value: null },
  paidInShares: { value: null, effectiveYear: null, effectiveMonth: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: {},
  warnings,
});

export const calculateCashFlowPerShare = async (query: CashFlowPerShareQuery): Promise<CashFlowPerShareResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司現金流量表有資料」的最新一季——不同公司財報申報進度不同步，
  // 見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined ? { year: query.year, season: query.season } : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季現金流量表有資料的季度，無法決定要用哪一季計算每股現金流。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const currentCashFlow = await getQuarterlyCashFlowStatement({ symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId });
  if (!currentCashFlow) warnings.push('查無該季現金流量表資料。');
  if (subsidiaryCompanyId) {
    warnings.push(
      '已指定 subsidiaryCompanyId：股本歷史資料（capital_stock_history）只有母公司（上市櫃公司本身）的紀錄，這裡查到的流通股數是母公司的股本結構，不是子公司的，每股現金流數值請自行判斷是否適用。'
    );
  }

  const operatingCashFlow = currentCashFlow?.netCashFromOperatingActivities ?? null;
  const capitalExpenditures = currentCashFlow?.capitalExpenditures ?? null;
  if (currentCashFlow && operatingCashFlow === null) warnings.push('該季現金流量表營業活動現金流量欄位為 null，無法計算 OCF/FCF。');
  if (currentCashFlow && capitalExpenditures === null) warnings.push('該季現金流量表資本支出欄位為 null，無法計算 FCF。');

  const currentFcf = operatingCashFlow !== null && capitalExpenditures !== null ? operatingCashFlow + capitalExpenditures : null;

  // TTM：近四季（含本季）加總。一季只要營業活動現金流量或資本支出任一為 null 就視為該季不齊，
  // OCF、FCF 共用同一組「資料齊不齊」判斷，不分開追蹤，避免兩套缺季清單互相打架。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((q) =>
      getQuarterlyCashFlowStatement({
        symbol: symbol,
        year: Number(q.year),
        quarter: Number(q.season),
        dataType,
        subsidiaryCompanyId,
      })
    )
  );

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let ocfTtmSum = 0n;
  let capexTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const record = ttmRecords[i]!;
    if (record === null || record.netCashFromOperatingActivities === null || record.capitalExpenditures === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      ocfTtmSum += record.netCashFromOperatingActivities;
      capexTtmSum += record.capitalExpenditures;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM OCF/FCF。`);

  const reportDate = currentCashFlow?.reportDate ?? null;

  let paidInShares: bigint | null = null;
  let effectiveYear: number | null = null;
  let effectiveMonth: number | null = null;
  if (reportDate) {
    const shares = await getPaidInSharesAsOf(symbol, reportDate);
    if (shares) {
      paidInShares = shares.paidInShares;
      effectiveYear = shares.effectiveYear;
      effectiveMonth = shares.effectiveMonth;
    } else {
      warnings.push('查無本季報告日之前生效的股本歷史資料（capital_stock_history），無法計算每股現金流。');
    }
  }
  if (paidInShares !== null && paidInShares <= 0n) warnings.push('流通股數為零或負數，每股現金流數值意義有限，請自行判斷是否採用。');

  let ocfPerShareQuarterly: number | null = null;
  let ocfPerShareQuarterlyAnnualized: number | null = null;
  let fcfPerShareQuarterly: number | null = null;
  let fcfPerShareQuarterlyAnnualized: number | null = null;
  if (paidInShares !== null) {
    if (operatingCashFlow !== null) {
      ocfPerShareQuarterly = toPerShare(operatingCashFlow, paidInShares);
      if (ocfPerShareQuarterly !== null) ocfPerShareQuarterlyAnnualized = Math.round(ocfPerShareQuarterly * 4 * 100) / 100;
    }
    if (currentFcf !== null) {
      fcfPerShareQuarterly = toPerShare(currentFcf, paidInShares);
      if (fcfPerShareQuarterly !== null) fcfPerShareQuarterlyAnnualized = Math.round(fcfPerShareQuarterly * 4 * 100) / 100;
    }
  }

  const operatingCashFlowTtmValue = ttmComplete ? ocfTtmSum : null;
  const capitalExpendituresTtmValue = ttmComplete ? capexTtmSum : null;
  const fcfTtmValue = ttmComplete ? ocfTtmSum + capexTtmSum : null;

  let ocfPerShareTtm: number | null = null;
  let fcfPerShareTtm: number | null = null;
  if (paidInShares !== null) {
    if (operatingCashFlowTtmValue !== null) ocfPerShareTtm = toPerShare(operatingCashFlowTtmValue, paidInShares);
    if (fcfTtmValue !== null) fcfPerShareTtm = toPerShare(fcfTtmValue, paidInShares);
  }

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    ocfPerShareQuarterly === null
      ? ['ocfPerShareQuarterly', { status: 'no_data', message: '流通股數或本季營業活動現金流量缺漏，無法計算每股營業現金流。' }]
      : null,
    ocfPerShareTtm === null ? ['ocfPerShareTtm', { status: 'no_data', message: '流通股數缺漏，或近四季資料不齊，無法計算 TTM 每股營業現金流。' }] : null,
    fcfPerShareQuarterly === null
      ? ['fcfPerShareQuarterly', { status: 'no_data', message: '流通股數或本季自由現金流缺漏，無法計算每股自由現金流。' }]
      : null,
    fcfPerShareTtm === null ? ['fcfPerShareTtm', { status: 'no_data', message: '流通股數缺漏，或近四季資料不齊，無法計算 TTM 每股自由現金流。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 cash_flow_per_share，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.cashFlowPerShareResult.upsert({
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
        ocfPerShareQuarterly,
        ocfPerShareQuarterlyAnnualized,
        ocfPerShareTtm,
        fcfPerShareQuarterly,
        fcfPerShareQuarterlyAnnualized,
        fcfPerShareTtm,
        operatingCashFlowValue: operatingCashFlow,
        operatingCashFlowTtmValue,
        capitalExpendituresValue: capitalExpenditures,
        capitalExpendituresTtmValue,
        paidInShares,
        capitalStockEffectiveYear: effectiveYear,
        capitalStockEffectiveMonth: effectiveMonth,
        warnings,
      },
      update: {
        reportDate,
        ocfPerShareQuarterly,
        ocfPerShareQuarterlyAnnualized,
        ocfPerShareTtm,
        fcfPerShareQuarterly,
        fcfPerShareQuarterlyAnnualized,
        fcfPerShareTtm,
        operatingCashFlowValue: operatingCashFlow,
        operatingCashFlowTtmValue,
        capitalExpendituresValue: capitalExpenditures,
        capitalExpendituresTtmValue,
        paidInShares,
        capitalStockEffectiveYear: effectiveYear,
        capitalStockEffectiveMonth: effectiveMonth,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[cash-flow-per-share]: 寫入 cash_flow_per_share 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    ocfPerShareQuarterly,
    ocfPerShareQuarterlyAnnualized,
    ocfPerShareTtm,
    fcfPerShareQuarterly,
    fcfPerShareQuarterlyAnnualized,
    fcfPerShareTtm,
    operatingCashFlow: { value: operatingCashFlow?.toString() ?? null },
    operatingCashFlowTtm: { value: operatingCashFlowTtmValue?.toString() ?? null },
    capitalExpenditures: { value: capitalExpenditures?.toString() ?? null },
    capitalExpendituresTtm: { value: capitalExpendituresTtmValue?.toString() ?? null },
    paidInShares: {
      value: paidInShares?.toString() ?? null,
      effectiveYear,
      effectiveMonth,
    },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
