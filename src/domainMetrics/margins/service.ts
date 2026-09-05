import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { MarginsQuery, MarginsResult } from './types';
import { logger } from '@/shared/logger';

// 淨利欄位選擇邏輯跟 ROE 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { field: 'netIncomeAttributableToParent' | 'netIncome' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.netIncomeAttributableToParent !== null) return { field: 'netIncomeAttributableToParent', value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { field: 'netIncome', value: record.netIncome };
  return { field: null, value: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): MarginsResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  grossMarginQuarterly: null,
  grossMarginTtm: null,
  operatingMarginQuarterly: null,
  operatingMarginTtm: null,
  netProfitMarginQuarterly: null,
  netProfitMarginTtm: null,
  operatingRevenue: { value: null },
  operatingRevenueTtm: { value: null },
  grossProfit: { value: null },
  grossProfitTtm: { value: null },
  operatingIncome: { value: null },
  operatingIncomeTtm: { value: null },
  netIncome: { fieldUsed: null, value: null },
  netIncomeTtm: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: {},
  warnings,
});

export const calculateMargins = async (query: MarginsQuery): Promise<MarginsResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司損益表有資料」的最新一季，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季損益表有資料的季度，無法決定要用哪一季計算毛利率/營業利益率/稅後淨利率。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const currentIncomeStatement = await getQuarterlyIncomeStatement({ symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId });
  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');

  const operatingRevenue = currentIncomeStatement?.operatingRevenue ?? null;
  const grossProfit = currentIncomeStatement?.grossProfit ?? null;
  const operatingIncome = currentIncomeStatement?.operatingIncome ?? null;
  const netIncome = pickNetIncome(currentIncomeStatement);

  if (currentIncomeStatement && operatingRevenue === null) warnings.push('該季損益表營收欄位為 null，三個率都無法計算。');
  if (currentIncomeStatement && grossProfit === null) warnings.push('該季損益表毛利欄位為 null，無法計算毛利率。');
  if (currentIncomeStatement && operatingIncome === null) warnings.push('該季損益表營業利益欄位為 null，無法計算營業利益率。');
  if (currentIncomeStatement && netIncome.value === null) warnings.push('該季損益表淨利相關欄位皆為 null，無法計算稅後淨利率。');

  // TTM：近四季（含本季）營收、毛利、營業利益、淨利各自加總。一季只要任一欄位為 null 就視為該季不齊，
  // 三個比率共用同一組「資料齊不齊」判斷，不分開追蹤三套缺季清單。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((q) =>
      getQuarterlyIncomeStatement({
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
  let revenueTtmSum = 0n;
  let grossProfitTtmSum = 0n;
  let operatingIncomeTtmSum = 0n;
  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const record = ttmRecords[i]!;
    const picked = pickNetIncome(record);
    if (record === null || record.operatingRevenue === null || record.grossProfit === null || record.operatingIncome === null || picked.value === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      revenueTtmSum += record.operatingRevenue;
      grossProfitTtmSum += record.grossProfit;
      operatingIncomeTtmSum += record.operatingIncome;
      netIncomeTtmSum += picked.value;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 毛利率/營業利益率/稅後淨利率。`);

  const operatingRevenueTtmValue = ttmComplete ? revenueTtmSum : null;
  const grossProfitTtmValue = ttmComplete ? grossProfitTtmSum : null;
  const operatingIncomeTtmValue = ttmComplete ? operatingIncomeTtmSum : null;
  const netIncomeTtmValue = ttmComplete ? netIncomeTtmSum : null;

  const grossMarginQuarterly = operatingRevenue !== null && grossProfit !== null ? toPct(grossProfit, operatingRevenue) : null;
  const operatingMarginQuarterly = operatingRevenue !== null && operatingIncome !== null ? toPct(operatingIncome, operatingRevenue) : null;
  const netProfitMarginQuarterly = operatingRevenue !== null && netIncome.value !== null ? toPct(netIncome.value, operatingRevenue) : null;

  const grossMarginTtm = operatingRevenueTtmValue !== null && grossProfitTtmValue !== null ? toPct(grossProfitTtmValue, operatingRevenueTtmValue) : null;
  const operatingMarginTtm =
    operatingRevenueTtmValue !== null && operatingIncomeTtmValue !== null ? toPct(operatingIncomeTtmValue, operatingRevenueTtmValue) : null;
  const netProfitMarginTtm = operatingRevenueTtmValue !== null && netIncomeTtmValue !== null ? toPct(netIncomeTtmValue, operatingRevenueTtmValue) : null;

  const reportDate = currentIncomeStatement?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    grossMarginQuarterly === null ? ['grossMarginQuarterly', { status: 'no_data', message: '本季營收或毛利缺漏，無法計算毛利率。' }] : null,
    grossMarginTtm === null ? ['grossMarginTtm', { status: 'no_data', message: '近四季資料不齊，無法計算 TTM 毛利率。' }] : null,
    operatingMarginQuarterly === null
      ? ['operatingMarginQuarterly', { status: 'no_data', message: '本季營收或營業利益缺漏，無法計算營業利益率。' }]
      : null,
    operatingMarginTtm === null ? ['operatingMarginTtm', { status: 'no_data', message: '近四季資料不齊，無法計算 TTM 營業利益率。' }] : null,
    netProfitMarginQuarterly === null
      ? ['netProfitMarginQuarterly', { status: 'no_data', message: '本季營收或淨利缺漏，無法計算稅後淨利率。' }]
      : null,
    netProfitMarginTtm === null ? ['netProfitMarginTtm', { status: 'no_data', message: '近四季資料不齊，無法計算 TTM 稅後淨利率。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 profitability_margins，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.marginsResult.upsert({
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
        grossMarginQuarterly,
        grossMarginTtm,
        operatingMarginQuarterly,
        operatingMarginTtm,
        netProfitMarginQuarterly,
        netProfitMarginTtm,
        operatingRevenueValue: operatingRevenue,
        operatingRevenueTtmValue,
        grossProfitValue: grossProfit,
        grossProfitTtmValue,
        operatingIncomeValue: operatingIncome,
        operatingIncomeTtmValue,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        warnings,
      },
      update: {
        reportDate,
        grossMarginQuarterly,
        grossMarginTtm,
        operatingMarginQuarterly,
        operatingMarginTtm,
        netProfitMarginQuarterly,
        netProfitMarginTtm,
        operatingRevenueValue: operatingRevenue,
        operatingRevenueTtmValue,
        grossProfitValue: grossProfit,
        grossProfitTtmValue,
        operatingIncomeValue: operatingIncome,
        operatingIncomeTtmValue,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[margins]: 寫入 profitability_margins 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    grossMarginQuarterly,
    grossMarginTtm,
    operatingMarginQuarterly,
    operatingMarginTtm,
    netProfitMarginQuarterly,
    netProfitMarginTtm,
    operatingRevenue: { value: operatingRevenue?.toString() ?? null },
    operatingRevenueTtm: { value: operatingRevenueTtmValue?.toString() ?? null },
    grossProfit: { value: grossProfit?.toString() ?? null },
    grossProfitTtm: { value: grossProfitTtmValue?.toString() ?? null },
    operatingIncome: { value: operatingIncome?.toString() ?? null },
    operatingIncomeTtm: { value: operatingIncomeTtmValue?.toString() ?? null },
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    netIncomeTtm: { value: netIncomeTtmValue?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
