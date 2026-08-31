import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import type { OwnerEarningsQuery, OwnerEarningsResult } from './types';

// 淨利欄位選擇邏輯跟 ROE/EPS 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { field: 'netIncomeAttributableToParent' | 'netIncome' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.netIncomeAttributableToParent !== null) return { field: 'netIncomeAttributableToParent', value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { field: 'netIncome', value: record.netIncome };
  return { field: null, value: null };
};

// 財報金額欄位單位是「千元」，但流通股數是實際股數，分子要先換算成元（x1000）才能除。
const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (companyId: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): OwnerEarningsResult => ({
  companyId,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  ownerEarningsPerShareQuarterly: null,
  ownerEarningsPerShareQuarterlyAnnualized: null,
  ownerEarningsPerShareTtm: null,
  netIncome: { fieldUsed: null, value: null },
  netIncomeTtm: { value: null },
  depreciationAndAmortization: { value: null },
  depreciationAndAmortizationTtm: { value: null },
  capitalExpenditures: { value: null },
  capitalExpendituresTtm: { value: null },
  paidInShares: { value: null, effectiveYear: null, effectiveMonth: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  warnings,
});

export const calculateOwnerEarnings = async (query: OwnerEarningsQuery): Promise<OwnerEarningsResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司損益表跟現金流量表都有資料」的最新一季——不同公司財報
  // 申報進度不同步（實測驗證過：2887 損益表曾經卡在比資產負債表舊 3 季），見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['incomeStatement', 'cashFlowStatement']);
  if (!resolvedQuarter) {
    return emptyResult(companyId, dataType, subsidiaryCompanyId, ['查無任何一季損益表/現金流量表都有資料的季度，無法決定要用哪一季計算股東盈餘。']);
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
  if (subsidiaryCompanyId) {
    warnings.push(
      '已指定 subsidiaryCompanyId：股本歷史資料（capital_stock_history）只有母公司（上市櫃公司本身）的紀錄，這裡查到的流通股數是母公司的股本結構，不是子公司的，股東盈餘數值請自行判斷是否適用。'
    );
  }

  const netIncome = pickNetIncome(currentIncomeStatement);
  const depreciation = currentCashFlow?.depreciation ?? null;
  const amortization = currentCashFlow?.amortization ?? null;
  const capitalExpenditures = currentCashFlow?.capitalExpenditures ?? null;
  if (currentIncomeStatement && netIncome.value === null) warnings.push('該季損益表淨利相關欄位皆為 null，無法計算股東盈餘。');
  if (currentCashFlow && (depreciation === null || amortization === null)) warnings.push('該季現金流量表折舊或攤銷欄位為 null，無法計算股東盈餘。');
  if (currentCashFlow && capitalExpenditures === null) warnings.push('該季現金流量表資本支出欄位為 null，無法計算股東盈餘。');

  const depreciationAndAmortization = depreciation !== null && amortization !== null ? depreciation + amortization : null;
  const currentOwnerEarnings =
    netIncome.value !== null && depreciationAndAmortization !== null && capitalExpenditures !== null
      ? netIncome.value + depreciationAndAmortization + capitalExpenditures
      : null;

  // TTM：近四季（含本季）淨利、折舊、攤銷、資本支出各自加總。一季只要任一欄位缺漏就視為該季不齊。
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
  let daTtmSum = 0n;
  let capexTtmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const picked = pickNetIncome(ttmIncomeRecords[i]!);
    const cashFlowRecord = ttmCashFlowRecords[i]!;
    if (
      picked.value === null ||
      cashFlowRecord === null ||
      cashFlowRecord.depreciation === null ||
      cashFlowRecord.amortization === null ||
      cashFlowRecord.capitalExpenditures === null
    ) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      netIncomeTtmSum += picked.value;
      daTtmSum += cashFlowRecord.depreciation + cashFlowRecord.amortization;
      capexTtmSum += cashFlowRecord.capitalExpenditures;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 股東盈餘。`);

  const netIncomeTtmValue = ttmComplete ? netIncomeTtmSum : null;
  const daTtmValue = ttmComplete ? daTtmSum : null;
  const capexTtmValue = ttmComplete ? capexTtmSum : null;
  const ownerEarningsTtmValue =
    netIncomeTtmValue !== null && daTtmValue !== null && capexTtmValue !== null ? netIncomeTtmValue + daTtmValue + capexTtmValue : null;

  const reportDate = currentIncomeStatement?.reportDate ?? currentCashFlow?.reportDate ?? null;

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
      warnings.push('查無本季報告日之前生效的股本歷史資料（capital_stock_history），無法計算每股股東盈餘。');
    }
  }
  if (paidInShares !== null && paidInShares <= 0n) warnings.push('流通股數為零或負數，每股股東盈餘數值意義有限，請自行判斷是否採用。');

  let ownerEarningsPerShareQuarterly: number | null = null;
  let ownerEarningsPerShareQuarterlyAnnualized: number | null = null;
  if (currentOwnerEarnings !== null && paidInShares !== null) {
    ownerEarningsPerShareQuarterly = toPerShare(currentOwnerEarnings, paidInShares);
    if (ownerEarningsPerShareQuarterly !== null) ownerEarningsPerShareQuarterlyAnnualized = Math.round(ownerEarningsPerShareQuarterly * 4 * 100) / 100;
  }
  const ownerEarningsPerShareTtm =
    ownerEarningsTtmValue !== null && paidInShares !== null ? toPerShare(ownerEarningsTtmValue, paidInShares) : null;

  // 存進 oingg-analysis DB 的 guru_owner_earnings，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.ownerEarningsResult.upsert({
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
        ownerEarningsPerShareQuarterly,
        ownerEarningsPerShareQuarterlyAnnualized,
        ownerEarningsPerShareTtm,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        depreciationAndAmortizationValue: depreciationAndAmortization,
        depreciationAndAmortizationTtmValue: daTtmValue,
        capitalExpendituresValue: capitalExpenditures,
        capitalExpendituresTtmValue: capexTtmValue,
        paidInShares,
        capitalStockEffectiveYear: effectiveYear,
        capitalStockEffectiveMonth: effectiveMonth,
        warnings,
      },
      update: {
        reportDate,
        ownerEarningsPerShareQuarterly,
        ownerEarningsPerShareQuarterlyAnnualized,
        ownerEarningsPerShareTtm,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        depreciationAndAmortizationValue: depreciationAndAmortization,
        depreciationAndAmortizationTtmValue: daTtmValue,
        capitalExpendituresValue: capitalExpenditures,
        capitalExpendituresTtmValue: capexTtmValue,
        paidInShares,
        capitalStockEffectiveYear: effectiveYear,
        capitalStockEffectiveMonth: effectiveMonth,
        warnings,
      },
    });
  } catch (error) {
    console.error('[owner-earnings]: 寫入 guru_owner_earnings 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    ownerEarningsPerShareQuarterly,
    ownerEarningsPerShareQuarterlyAnnualized,
    ownerEarningsPerShareTtm,
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    netIncomeTtm: { value: netIncomeTtmValue?.toString() ?? null },
    depreciationAndAmortization: { value: depreciationAndAmortization?.toString() ?? null },
    depreciationAndAmortizationTtm: { value: daTtmValue?.toString() ?? null },
    capitalExpenditures: { value: capitalExpenditures?.toString() ?? null },
    capitalExpendituresTtm: { value: capexTtmValue?.toString() ?? null },
    paidInShares: {
      value: paidInShares?.toString() ?? null,
      effectiveYear,
      effectiveMonth,
    },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
