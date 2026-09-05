import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { InterestCoverageQuery, InterestCoverageResult } from './types';
import { logger } from '@/shared/logger';

const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100; // 四捨五入到小數 2 位，單位是「次」
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): InterestCoverageResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  interestCoverageQuarterly: null,
  interestCoverageTtm: null,
  ebit: { value: null },
  ebitTtm: { value: null },
  interestExpense: { value: null },
  interestExpenseTtm: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: {},
  warnings,
});

export const calculateInterestCoverage = async (query: InterestCoverageQuery): Promise<InterestCoverageResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司損益表有資料」的最新一季——不同公司財報
  // 申報進度不同步（實測驗證過：2887 損益表曾經卡在比資產負債表舊 3 季），見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined ? { year: query.year, season: query.season } : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季損益表有資料的季度，無法決定要用哪一季計算利息保障倍數。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const currentIncomeStatement = await getQuarterlyIncomeStatement({ symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId });
  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');

  const interestExpense = currentIncomeStatement?.financeCosts ?? null;
  const ebit =
    currentIncomeStatement?.profitBeforeTax !== undefined &&
    currentIncomeStatement?.profitBeforeTax !== null &&
    interestExpense !== null
      ? currentIncomeStatement.profitBeforeTax + interestExpense
      : null;

  if (currentIncomeStatement && currentIncomeStatement.profitBeforeTax === null) warnings.push('該季損益表稅前淨利欄位為 null，無法計算 EBIT/利息保障倍數。');
  if (currentIncomeStatement && interestExpense === null) warnings.push('該季損益表利息費用（financeCosts）欄位為 null，無法計算 EBIT/利息保障倍數。');
  if (interestExpense !== null && interestExpense === 0n) warnings.push('本季利息費用為零，利息保障倍數無法計算（除以零）。');

  // TTM：近四季（含本季）EBIT、利息費用各自加總。一季只要稅前淨利或利息費用任一為 null 就視為該季不齊。
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
  let ebitTtmSum = 0n;
  let interestExpenseTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const record = ttmRecords[i]!;
    if (record === null || record.profitBeforeTax === null || record.financeCosts === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      ebitTtmSum += record.profitBeforeTax + record.financeCosts;
      interestExpenseTtmSum += record.financeCosts;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 利息保障倍數。`);

  const ebitTtmValue = ttmComplete ? ebitTtmSum : null;
  const interestExpenseTtmValue = ttmComplete ? interestExpenseTtmSum : null;

  const interestCoverageQuarterly = ebit !== null && interestExpense !== null ? toRatio(ebit, interestExpense) : null;
  const interestCoverageTtm = ebitTtmValue !== null && interestExpenseTtmValue !== null ? toRatio(ebitTtmValue, interestExpenseTtmValue) : null;

  const reportDate = currentIncomeStatement?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    interestCoverageQuarterly === null
      ? ebit === null || interestExpense === null
        ? ['interestCoverageQuarterly', { status: 'no_data', message: '本季稅前淨利或利息費用缺漏，無法計算利息保障倍數。' }]
        : ['interestCoverageQuarterly', { status: 'calculation_error', message: '本季利息費用為零，利息保障倍數無法計算（除以零）。' }]
      : null,
    interestCoverageTtm === null
      ? ebitTtmValue === null || interestExpenseTtmValue === null
        ? ['interestCoverageTtm', { status: 'no_data', message: '近四季資料不齊，無法計算 TTM 利息保障倍數。' }]
        : ['interestCoverageTtm', { status: 'calculation_error', message: '近四季利息費用加總為零，TTM 利息保障倍數無法計算（除以零）。' }]
      : null,
  ];

  // 存進 oingg-analysis DB 的 resilience_interest_coverage，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.interestCoverageResult.upsert({
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
        interestCoverageQuarterly,
        interestCoverageTtm,
        ebitValue: ebit,
        ebitTtmValue,
        interestExpenseValue: interestExpense,
        interestExpenseTtmValue,
        warnings,
      },
      update: {
        reportDate,
        interestCoverageQuarterly,
        interestCoverageTtm,
        ebitValue: ebit,
        ebitTtmValue,
        interestExpenseValue: interestExpense,
        interestExpenseTtmValue,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[interest-coverage]: 寫入 resilience_interest_coverage 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    interestCoverageQuarterly,
    interestCoverageTtm,
    ebit: { value: ebit?.toString() ?? null },
    ebitTtm: { value: ebitTtmValue?.toString() ?? null },
    interestExpense: { value: interestExpense?.toString() ?? null },
    interestExpenseTtm: { value: interestExpenseTtmValue?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
