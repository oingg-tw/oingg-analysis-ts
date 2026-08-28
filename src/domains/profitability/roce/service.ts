import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/latestQuarter';
import type { RoceQuery, RoceResult } from './types';

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

// EBIT = 稅前淨利 + 利息費用，跟 interestCoverage/netDebtToEbitda 完全一致的算法（財報沒有現成 EBIT 欄位）。
const calculateEbit = (record: { profitBeforeTax: bigint | null; financeCosts: bigint | null } | null): bigint | null => {
  if (!record || record.profitBeforeTax === null || record.financeCosts === null) return null;
  return record.profitBeforeTax + record.financeCosts;
};

const emptyResult = (companyId: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): RoceResult => ({
  companyId,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  roceQuarterlyPct: null,
  roceQuarterlyAnnualizedPct: null,
  roceTtmPct: null,
  ebit: { value: null },
  ebitTtm: { value: null },
  capitalEmployed: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  warnings,
});

export const calculateRoce = async (query: RoceQuery): Promise<RoceResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季，見 shared/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(companyId, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算 ROCE。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
  };

  const [balanceSheet, currentIncomeStatement] = await Promise.all([
    prisma.quarterlyBalanceSheet.findUnique({ where }),
    prisma.quarterlyIncomeStatement.findUnique({ where }),
  ]);

  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');
  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');
  if (currentIncomeStatement && (currentIncomeStatement.profitBeforeTax === null || currentIncomeStatement.financeCosts === null)) {
    warnings.push('該季損益表稅前淨利或利息費用欄位為 null，無法計算 EBIT。');
  }

  const capitalEmployed =
    balanceSheet?.totalAssets !== null && balanceSheet?.totalAssets !== undefined && balanceSheet?.currentLiabilities !== null
      ? balanceSheet.totalAssets - (balanceSheet?.currentLiabilities ?? 0n)
      : null;
  if (balanceSheet && (balanceSheet.totalAssets === null || balanceSheet.currentLiabilities === null)) {
    warnings.push('該季資產負債表總資產或流動負債欄位為 null，無法計算使用資本（Capital Employed）。');
  }

  const ebit = calculateEbit(currentIncomeStatement);

  let roceQuarterlyPct: number | null = null;
  let roceQuarterlyAnnualizedPct: number | null = null;
  if (ebit !== null && capitalEmployed !== null) {
    roceQuarterlyPct = toPct(ebit, capitalEmployed);
    if (roceQuarterlyPct !== null) roceQuarterlyAnnualizedPct = Math.round(roceQuarterlyPct * 4 * 100) / 100;
    if (capitalEmployed <= 0n) warnings.push('本季期末使用資本（總資產 - 流動負債）為零或負數，ROCE 數值意義有限，請自行判斷是否採用。');
  }

  // TTM：近四季（含本季）EBIT 加總 / 本季期末使用資本。一季只要稅前淨利或利息費用任一為 null 就視為該季不齊。
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

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let ebitTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const quarterEbit = calculateEbit(ttmIncomeRecords[i]!);
    if (quarterEbit === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      ebitTtmSum += quarterEbit;
    }
  });
  if (!ttmComplete) warnings.push(`近四季損益表資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM ROCE。`);

  const ebitTtmValue = ttmComplete ? ebitTtmSum : null;
  const roceTtmPct = ebitTtmValue !== null && capitalEmployed !== null ? toPct(ebitTtmValue, capitalEmployed) : null;

  const reportDate = balanceSheet?.reportDate ?? currentIncomeStatement?.reportDate ?? null;

  // 存進 oingg-analysis DB 的 profitability_roce，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.roceResult.upsert({
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
        roceQuarterlyPct,
        roceQuarterlyAnnualizedPct,
        roceTtmPct,
        ebitValue: ebit,
        ebitTtmValue,
        capitalEmployedValue: capitalEmployed,
        warnings,
      },
      update: {
        reportDate,
        roceQuarterlyPct,
        roceQuarterlyAnnualizedPct,
        roceTtmPct,
        ebitValue: ebit,
        ebitTtmValue,
        capitalEmployedValue: capitalEmployed,
        warnings,
      },
    });
  } catch (error) {
    console.error('[roce]: 寫入 profitability_roce 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    roceQuarterlyPct,
    roceQuarterlyAnnualizedPct,
    roceTtmPct,
    ebit: { value: ebit?.toString() ?? null },
    ebitTtm: { value: ebitTtmValue?.toString() ?? null },
    capitalEmployed: { value: capitalEmployed?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
