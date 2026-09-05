import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { MetricResultMeta } from '@/shared/metricStatus';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyCashFlowStatement, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';
import { logger } from '@/shared/logger';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
// 最新一季（見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type NetDebtToEbitdaQuery = QuarterlyMetricQuery;

export interface NetDebtToEbitdaResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 淨負債對 EBITDA 比 = 本季期末淨負債 / EBITDA。
  // 淨負債（存量，本季期末）對「一年份」EBITDA（流量）的比率，taxonomy 只支援 TTM/FY，不支援單季——
  // 拿淨負債除以「一季」的 EBITDA 沒有標準意義（單位是「幾季還完」還是「幾年還完」會混淆），
  // 所以只有簡單年化（單季 EBITDA x4）跟 TTM 兩種口徑，沒有原始單季版本。
  netDebtToEbitdaQuarterlyAnnualized: number | null;
  netDebtToEbitdaTtm: number | null;

  netDebt: {
    // 本季期末：有息負債 - 現金及約當現金。可能是負數（代表淨現金部位，不是淨負債）。
    value: string | null; // BigInt as string
  };
  totalDebt: {
    value: string | null; // BigInt as string；有息負債（短期借款+應付公司債+長期借款）
  };
  cashAndEquivalents: {
    value: string | null; // BigInt as string
  };

  ebitdaQuarterly: {
    value: string | null; // BigInt as string；本季 EBITDA = EBIT + 折舊 + 攤銷
  };
  ebitdaTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  ttm: QuarterlyMetricTtmInfo;
}

const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): NetDebtToEbitdaResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  netDebtToEbitdaQuarterlyAnnualized: null,
  netDebtToEbitdaTtm: null,
  netDebt: { value: null },
  totalDebt: { value: null },
  cashAndEquivalents: { value: null },
  ebitdaQuarterly: { value: null },
  ebitdaTtm: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  warnings,
});

export const calculateNetDebtToEbitda = async (query: NetDebtToEbitdaQuery): Promise<NetDebtToEbitdaResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季——
  // 不同公司財報申報進度不同步（實測驗證過：2887 損益表曾經卡在比資產負債表舊 3 季），
  // 見 shared/sourceData/latestQuarter.ts。這支指標同時要用到三張表，取三張表都有資料的交集。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, [
      '查無任何一季資產負債表/損益表/現金流量表都有資料的季度，無法決定要用哪一季計算淨負債對 EBITDA 比。',
    ]);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const key = { symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId };

  const [balanceSheet, currentIncomeStatement, currentCashFlow] = await Promise.all([
    getQuarterlyBalanceSheet(key),
    getQuarterlyIncomeStatement(key),
    getQuarterlyCashFlowStatement(key),
  ]);

  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');
  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');
  if (!currentCashFlow) warnings.push('查無該季現金流量表資料。');

  // 有息負債三個欄位任一為 null 視為 0（沒有借那種負債），不是資料缺漏；只有整張資產負債表查無資料才視為缺漏。
  // 跟 deRatio 完全相同的邏輯。
  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  if (balanceSheet && cashAndEquivalents === null) warnings.push('該季資產負債表現金及約當現金欄位為 null，無法計算淨負債。');

  const netDebt = totalDebt !== null && cashAndEquivalents !== null ? totalDebt - cashAndEquivalents : null;

  const ebit =
    currentIncomeStatement?.profitBeforeTax !== null && currentIncomeStatement?.profitBeforeTax !== undefined && currentIncomeStatement?.financeCosts !== null
      ? currentIncomeStatement.profitBeforeTax + (currentIncomeStatement.financeCosts ?? 0n)
      : null;
  if (currentIncomeStatement && (currentIncomeStatement.profitBeforeTax === null || currentIncomeStatement.financeCosts === null)) {
    warnings.push('該季損益表稅前淨利或利息費用欄位為 null，無法計算 EBIT/EBITDA。');
  }
  if (currentCashFlow && (currentCashFlow.depreciation === null || currentCashFlow.amortization === null)) {
    warnings.push('該季現金流量表折舊或攤銷欄位為 null，無法計算 EBITDA。');
  }

  const ebitdaQuarterly =
    ebit !== null && currentCashFlow?.depreciation !== null && currentCashFlow?.depreciation !== undefined && currentCashFlow?.amortization !== null
      ? ebit + currentCashFlow.depreciation + (currentCashFlow.amortization ?? 0n)
      : null;

  // TTM：近四季（含本季）EBITDA 加總。一季只要稅前淨利、利息費用、折舊、攤銷任一為 null 就視為該季不齊。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const ttmIncomeRecords = await Promise.all(
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
  const ttmCashFlowRecords = await Promise.all(
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
  let ebitdaTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const incomeRecord = ttmIncomeRecords[i]!;
    const cashFlowRecord = ttmCashFlowRecords[i]!;
    if (
      incomeRecord === null ||
      incomeRecord.profitBeforeTax === null ||
      incomeRecord.financeCosts === null ||
      cashFlowRecord === null ||
      cashFlowRecord.depreciation === null ||
      cashFlowRecord.amortization === null
    ) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      ebitdaTtmSum += incomeRecord.profitBeforeTax + incomeRecord.financeCosts + cashFlowRecord.depreciation + cashFlowRecord.amortization;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM EBITDA / 淨負債對 EBITDA 比。`);

  const ebitdaTtmValue = ttmComplete ? ebitdaTtmSum : null;

  let netDebtToEbitdaQuarterlyAnnualized: number | null = null;
  if (netDebt !== null && ebitdaQuarterly !== null) {
    if (ebitdaQuarterly === 0n) {
      warnings.push('本季 EBITDA 為零，淨負債對 EBITDA 比（年化）無法計算（除以零）。');
    } else {
      netDebtToEbitdaQuarterlyAnnualized = toRatio(netDebt, ebitdaQuarterly * 4n);
    }
  }
  let netDebtToEbitdaTtm: number | null = null;
  if (netDebt !== null && ebitdaTtmValue !== null) {
    if (ebitdaTtmValue === 0n) {
      warnings.push('近四季 EBITDA 加總為零，TTM 淨負債對 EBITDA 比無法計算（除以零）。');
    } else {
      netDebtToEbitdaTtm = toRatio(netDebt, ebitdaTtmValue);
    }
  }

  const reportDate = balanceSheet?.reportDate ?? currentIncomeStatement?.reportDate ?? currentCashFlow?.reportDate ?? null;


  // 存進 oingg-analysis DB 的 resilience_net_debt_to_ebitda，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.netDebtToEbitdaResult.upsert({
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
        netDebtToEbitdaQuarterlyAnnualized,
        netDebtToEbitdaTtm,
        netDebtValue: netDebt,
        totalDebtValue: totalDebt,
        cashAndEquivalentsValue: cashAndEquivalents,
        ebitdaQuarterlyValue: ebitdaQuarterly,
        ebitdaTtmValue,
        warnings,
      },
      update: {
        reportDate,
        netDebtToEbitdaQuarterlyAnnualized,
        netDebtToEbitdaTtm,
        netDebtValue: netDebt,
        totalDebtValue: totalDebt,
        cashAndEquivalentsValue: cashAndEquivalents,
        ebitdaQuarterlyValue: ebitdaQuarterly,
        ebitdaTtmValue,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[net-debt-to-ebitda]: 寫入 resilience_net_debt_to_ebitda 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    netDebtToEbitdaQuarterlyAnnualized,
    netDebtToEbitdaTtm,
    netDebt: { value: netDebt?.toString() ?? null },
    totalDebt: { value: totalDebt?.toString() ?? null },
    cashAndEquivalents: { value: cashAndEquivalents?.toString() ?? null },
    ebitdaQuarterly: { value: ebitdaQuarterly?.toString() ?? null },
    ebitdaTtm: { value: ebitdaTtmValue?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
