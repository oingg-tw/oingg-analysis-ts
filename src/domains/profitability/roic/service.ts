import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/latestQuarter';
import type { RoicQuery, RoicResult } from './types';

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

// 權益欄位選擇邏輯跟 ROE/deRatio 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickEquity = (
  record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null
): { field: 'equityAttributableToParent' | 'totalEquity' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.equityAttributableToParent !== null) return { field: 'equityAttributableToParent', value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { field: 'totalEquity', value: record.totalEquity };
  return { field: null, value: null };
};

// NOPAT = EBIT x (1 - 有效稅率)；有效稅率 = 所得稅費用 / 稅前淨利，稅前淨利為零或負數時沒有意義，回傳 null。
// 財報金額本身是整數（千元），乘上稅率會產生小數，四捨五入回整數才能存進 BigInt 欄位——TSMC 這種規模的公司
// 換算後金額還在 JS number 安全整數範圍內（千元單位，遠低於 2^53），不會有精度問題。
const calculateNopat = (record: { profitBeforeTax: bigint | null; financeCosts: bigint | null; incomeTaxExpense: bigint | null } | null): bigint | null => {
  if (!record || record.profitBeforeTax === null || record.financeCosts === null || record.incomeTaxExpense === null) return null;
  if (record.profitBeforeTax <= 0n) return null;
  const ebit = record.profitBeforeTax + record.financeCosts;
  const effectiveTaxRate = Number(record.incomeTaxExpense) / Number(record.profitBeforeTax);
  return BigInt(Math.round(Number(ebit) * (1 - effectiveTaxRate)));
};

const emptyResult = (companyId: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): RoicResult => ({
  companyId,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  roicQuarterlyPct: null,
  roicQuarterlyAnnualizedPct: null,
  roicTtmPct: null,
  nopat: { value: null },
  nopatTtm: { value: null },
  investedCapital: { value: null },
  equity: { fieldUsed: null, value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  warnings,
});

export const calculateRoic = async (query: RoicQuery): Promise<RoicResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季，見 shared/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(companyId, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算 ROIC。']);
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

  const nopat = calculateNopat(currentIncomeStatement);
  if (currentIncomeStatement && nopat === null) {
    warnings.push('該季損益表稅前淨利、利息費用或所得稅費用欄位為 null，或稅前淨利為零/負數（有效稅率無意義），無法計算 NOPAT。');
  }

  // 有息負債三個欄位任一為 null 視為 0（沒有借那種負債），不是資料缺漏；只有整張資產負債表查無資料才視為缺漏。
  // 跟 deRatio/netDebtToEbitda 完全相同的邏輯。
  const totalDebt = balanceSheet
    ? (balanceSheet.shortTermBorrowings ?? 0n) + (balanceSheet.bondsPayable ?? 0n) + (balanceSheet.longTermBorrowings ?? 0n)
    : null;
  const equity = pickEquity(balanceSheet);
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  if (balanceSheet && equity.value === null) warnings.push('該季資產負債表權益相關欄位皆為 null，無法計算投入資本。');
  if (balanceSheet && cashAndEquivalents === null) warnings.push('該季資產負債表現金及約當現金欄位為 null，無法計算投入資本。');

  const investedCapital =
    totalDebt !== null && equity.value !== null && cashAndEquivalents !== null ? totalDebt + equity.value - cashAndEquivalents : null;

  let roicQuarterlyPct: number | null = null;
  let roicQuarterlyAnnualizedPct: number | null = null;
  if (nopat !== null && investedCapital !== null) {
    roicQuarterlyPct = toPct(nopat, investedCapital);
    if (roicQuarterlyPct !== null) roicQuarterlyAnnualizedPct = Math.round(roicQuarterlyPct * 4 * 100) / 100;
    if (investedCapital <= 0n) warnings.push('本季期末投入資本為零或負數，ROIC 數值意義有限，請自行判斷是否採用。');
  }

  // TTM：近四季（含本季）各季 NOPAT 加總 / 本季期末投入資本。一季只要 NOPAT 無法計算（欄位缺漏或
  // 稅前淨利非正）就視為該季不齊。
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
  let nopatTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const quarterNopat = calculateNopat(ttmIncomeRecords[i]!);
    if (quarterNopat === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      nopatTtmSum += quarterNopat;
    }
  });
  if (!ttmComplete) warnings.push(`近四季損益表資料不齊或稅前淨利非正（缺: ${quartersMissing.join(', ')}），無法計算 TTM ROIC。`);

  const nopatTtmValue = ttmComplete ? nopatTtmSum : null;
  const roicTtmPct = nopatTtmValue !== null && investedCapital !== null ? toPct(nopatTtmValue, investedCapital) : null;

  const reportDate = balanceSheet?.reportDate ?? currentIncomeStatement?.reportDate ?? null;

  // 存進 oingg-analysis DB 的 profitability_roic，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.roicResult.upsert({
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
        roicQuarterlyPct,
        roicQuarterlyAnnualizedPct,
        roicTtmPct,
        nopatValue: nopat,
        nopatTtmValue,
        investedCapitalValue: investedCapital,
        equityFieldUsed: equity.field,
        equityValue: equity.value,
        warnings,
      },
      update: {
        reportDate,
        roicQuarterlyPct,
        roicQuarterlyAnnualizedPct,
        roicTtmPct,
        nopatValue: nopat,
        nopatTtmValue,
        investedCapitalValue: investedCapital,
        equityFieldUsed: equity.field,
        equityValue: equity.value,
        warnings,
      },
    });
  } catch (error) {
    console.error('[roic]: 寫入 profitability_roic 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    roicQuarterlyPct,
    roicQuarterlyAnnualizedPct,
    roicTtmPct,
    nopat: { value: nopat?.toString() ?? null },
    nopatTtm: { value: nopatTtmValue?.toString() ?? null },
    investedCapital: { value: investedCapital?.toString() ?? null },
    equity: { fieldUsed: equity.field, value: equity.value?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
