import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import type { CapexToRevenueQuery, CapexToRevenueResult } from './types';

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

export const calculateCapexToRevenue = async (query: CapexToRevenueQuery): Promise<CapexToRevenueResult> => {
  const { companyId, year, season, dataType, subsidiaryCompanyId } = query;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const warnings: string[] = [];

  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
  };

  const [currentIncomeStatement, currentCashFlow] = await Promise.all([
    prisma.quarterlyIncomeStatement.findUnique({ where }),
    prisma.quarterlyCashFlowStatement.findUnique({ where }),
  ]);

  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');
  if (!currentCashFlow) warnings.push('查無該季現金流量表資料。');

  const operatingRevenue = currentIncomeStatement?.operatingRevenue ?? null;
  const capitalExpenditures = currentCashFlow?.capitalExpenditures ?? null;
  if (currentIncomeStatement && operatingRevenue === null) warnings.push('該季損益表營收欄位為 null，無法計算。');
  if (currentCashFlow && capitalExpenditures === null) warnings.push('該季現金流量表資本支出欄位為 null，無法計算。');

  // TTM：近四季（含本季）營收、資本支出各自加總。一季只要任一為 null 就視為該季不齊。
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
  let revenueTtmSum = 0n;
  let capexTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const incomeRecord = ttmIncomeRecords[i]!;
    const cashFlowRecord = ttmCashFlowRecords[i]!;
    if (incomeRecord === null || incomeRecord.operatingRevenue === null || cashFlowRecord === null || cashFlowRecord.capitalExpenditures === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      revenueTtmSum += incomeRecord.operatingRevenue;
      capexTtmSum += cashFlowRecord.capitalExpenditures;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 資本支出佔營收比。`);

  const operatingRevenueTtmValue = ttmComplete ? revenueTtmSum : null;
  const capitalExpendituresTtmValue = ttmComplete ? capexTtmSum : null;

  // capitalExpenditures 本身是負數（現金流出），取絕對值再算比率——資本支出佔營收比慣例上是正數百分比。
  const capexToRevenueQuarterly =
    operatingRevenue !== null && capitalExpenditures !== null ? toPct(capitalExpenditures < 0n ? -capitalExpenditures : capitalExpenditures, operatingRevenue) : null;
  const capexToRevenueTtm =
    operatingRevenueTtmValue !== null && capitalExpendituresTtmValue !== null
      ? toPct(capitalExpendituresTtmValue < 0n ? -capitalExpendituresTtmValue : capitalExpendituresTtmValue, operatingRevenueTtmValue)
      : null;

  const reportDate = currentIncomeStatement?.reportDate ?? currentCashFlow?.reportDate ?? null;

  // 存進 oingg-analysis DB 的 turnover_capex_to_revenue，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.capexToRevenueResult.upsert({
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
        capexToRevenueQuarterly,
        capexToRevenueTtm,
        capitalExpendituresValue: capitalExpenditures,
        capitalExpendituresTtmValue,
        operatingRevenueValue: operatingRevenue,
        operatingRevenueTtmValue,
        warnings,
      },
      update: {
        reportDate,
        capexToRevenueQuarterly,
        capexToRevenueTtm,
        capitalExpendituresValue: capitalExpenditures,
        capitalExpendituresTtmValue,
        operatingRevenueValue: operatingRevenue,
        operatingRevenueTtmValue,
        warnings,
      },
    });
  } catch (error) {
    console.error('[capex-to-revenue]: 寫入 turnover_capex_to_revenue 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    capexToRevenueQuarterly,
    capexToRevenueTtm,
    capitalExpenditures: { value: capitalExpenditures?.toString() ?? null },
    capitalExpendituresTtm: { value: capitalExpendituresTtmValue?.toString() ?? null },
    operatingRevenue: { value: operatingRevenue?.toString() ?? null },
    operatingRevenueTtm: { value: operatingRevenueTtmValue?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
