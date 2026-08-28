import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getPaidInSharesAsOf } from '@/shared/capitalStock';
import type { CashFlowPerShareQuery, CashFlowPerShareResult } from './types';

// 財報金額欄位單位是「千元」，但流通股數是實際股數，不是千股，兩者單位不同，
// 分子要先換算成元（x1000）才能除，否則會差 1000 倍（BVPS 曾踩過這個坑）。
const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100; // 四捨五入到小數 2 位
};

export const calculateCashFlowPerShare = async (query: CashFlowPerShareQuery): Promise<CashFlowPerShareResult> => {
  const { companyId, year, season, dataType, subsidiaryCompanyId } = query;
  const yearNum = Number(year);
  const seasonNum = Number(season);
  const warnings: string[] = [];

  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
  };

  const currentCashFlow = await prisma.quarterlyCashFlowStatement.findUnique({ where });
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
    const shares = await getPaidInSharesAsOf(companyId, reportDate);
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

  // 存進 oingg-analysis DB 的 cash_flow_per_share，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.cashFlowPerShareResult.upsert({
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
    console.error('[cash-flow-per-share]: 寫入 cash_flow_per_share 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
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
    warnings,
  };
};
