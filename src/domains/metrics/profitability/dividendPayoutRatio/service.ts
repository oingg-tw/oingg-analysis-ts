import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import type { DividendPayoutRatioQuery, DividendPayoutRatioResult } from './types';

// 淨利欄位選擇邏輯跟 ROE/EPS 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
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

const emptyResult = (companyId: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): DividendPayoutRatioResult => ({
  companyId,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  payoutRatioTtm: null,
  dividendsPaid: { value: null },
  dividendsPaidTtm: { value: null },
  netIncome: { fieldUsed: null, value: null },
  netIncomeTtm: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  warnings,
});

export const calculateDividendPayoutRatio = async (query: DividendPayoutRatioQuery): Promise<DividendPayoutRatioResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司損益表跟現金流量表都有資料」的最新一季，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['incomeStatement', 'cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(companyId, dataType, subsidiaryCompanyId, ['查無任何一季損益表/現金流量表都有資料的季度，無法決定要用哪一季計算配息率。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
  };

  const [currentIncomeStatement, currentCashFlow] = await Promise.all([
    prisma.quarterlyIncomeStatement.findUnique({ where }),
    prisma.quarterlyCashFlowStatement.findUnique({ where }),
  ]);

  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');
  if (!currentCashFlow) warnings.push('查無該季現金流量表資料。');

  const netIncome = pickNetIncome(currentIncomeStatement);
  // 現金股利通常一年只發放一到兩次，很多季本來就是 0（不是資料缺漏）——跟 deRatio/netDebtToEbitda
  // 的有息負債欄位一樣，缺值視為 0，不計入「資料不齊」判斷；只有淨利缺漏才會讓 TTM 視為不齊。
  const dividendsPaid = currentCashFlow?.dividendsPaid ?? 0n;

  // TTM：近四季（含本季）淨利、現金股利發放各自加總。淨利缺漏就視為該季不齊（跟 EPS 同一套判斷）；
  // 現金股利發放缺值一律當 0，不影響「資料齊不齊」。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const [ttmIncomeRecords, ttmCashFlowRecords] = await Promise.all([
    Promise.all(
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
    ),
    Promise.all(
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
    ),
  ]);

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let netIncomeTtmSum = 0n;
  let dividendsPaidTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const picked = pickNetIncome(ttmIncomeRecords[i]!);
    if (picked.value === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      netIncomeTtmSum += picked.value;
      dividendsPaidTtmSum += ttmCashFlowRecords[i]?.dividendsPaid ?? 0n;
    }
  });
  if (!ttmComplete) warnings.push(`近四季損益表資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 配息率。`);

  const netIncomeTtmValue = ttmComplete ? netIncomeTtmSum : null;
  const dividendsPaidTtmValue = ttmComplete ? dividendsPaidTtmSum : null;

  let payoutRatioTtm: number | null = null;
  if (netIncomeTtmValue !== null && dividendsPaidTtmValue !== null) {
    if (netIncomeTtmValue <= 0n) {
      warnings.push('近四季淨利加總為零或負數，配息率無法計算（分母須為正）。');
    } else {
      // dividendsPaid 是現金流量表原始值，通常是負數（現金流出），取絕對值才是「發放金額」。
      const paidAbs = dividendsPaidTtmValue < 0n ? -dividendsPaidTtmValue : dividendsPaidTtmValue;
      payoutRatioTtm = toPct(paidAbs, netIncomeTtmValue);
    }
  }

  const reportDate = currentIncomeStatement?.reportDate ?? currentCashFlow?.reportDate ?? null;

  // 存進 oingg-analysis DB 的 profitability_dividend_payout_ratio，供之後查歷史紀錄用；也供 sgr/ 直接引用。
  // 存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.dividendPayoutRatioResult.upsert({
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
        payoutRatioTtm,
        dividendsPaidValue: dividendsPaid,
        dividendsPaidTtmValue,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        warnings,
      },
      update: {
        reportDate,
        payoutRatioTtm,
        dividendsPaidValue: dividendsPaid,
        dividendsPaidTtmValue,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        warnings,
      },
    });
  } catch (error) {
    console.error('[dividend-payout-ratio]: 寫入 profitability_dividend_payout_ratio 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    payoutRatioTtm,
    dividendsPaid: { value: dividendsPaid.toString() },
    dividendsPaidTtm: { value: dividendsPaidTtmValue?.toString() ?? null },
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    netIncomeTtm: { value: netIncomeTtmValue?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
