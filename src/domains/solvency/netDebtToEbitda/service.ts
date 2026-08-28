import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import type { NetDebtToEbitdaQuery, NetDebtToEbitdaResult } from './types';

const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100; // 四捨五入到小數 2 位
};

export const calculateNetDebtToEbitda = async (query: NetDebtToEbitdaQuery): Promise<NetDebtToEbitdaResult> => {
  const { companyId, year, season, dataType, subsidiaryCompanyId } = query;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const warnings: string[] = [];

  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
  };

  const [balanceSheet, currentIncomeStatement, currentCashFlow] = await Promise.all([
    prisma.quarterlyBalanceSheet.findUnique({ where }),
    prisma.quarterlyIncomeStatement.findUnique({ where }),
    prisma.quarterlyCashFlowStatement.findUnique({ where }),
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
      prisma.quarterlyIncomeStatement.findUnique({
        where: {
          symbol_year_quarter_dataType_subsidiaryCompanyId: {
            symbol: companyId,
            year: Number(q.year),
            quarter: Number(q.season),
            dataType,
            subsidiaryCompanyId,
          },
        },
      })
    )
  );
  const ttmCashFlowRecords = await Promise.all(
    ttmQuarters.map((q) =>
      prisma.quarterlyCashFlowStatement.findUnique({
        where: {
          symbol_year_quarter_dataType_subsidiaryCompanyId: {
            symbol: companyId,
            year: Number(q.year),
            quarter: Number(q.season),
            dataType,
            subsidiaryCompanyId,
          },
        },
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

  // 存進 oingg-analysis DB 的 solvency_net_debt_to_ebitda，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.netDebtToEbitdaResult.upsert({
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
    console.error('[net-debt-to-ebitda]: 寫入 solvency_net_debt_to_ebitda 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
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
