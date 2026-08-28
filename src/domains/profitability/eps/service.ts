import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getPaidInSharesAsOf } from '@/shared/capitalStock';
import { getLatestAvailableQuarter } from '@/shared/latestQuarter';
import type { EpsQuery, EpsResult } from './types';

// 淨利欄位選擇邏輯跟 ROE 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { field: 'netIncomeAttributableToParent' | 'netIncome' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.netIncomeAttributableToParent !== null) return { field: 'netIncomeAttributableToParent', value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { field: 'netIncome', value: record.netIncome };
  return { field: null, value: null };
};

// 財報金額欄位單位是「千元」，但流通股數是實際股數，不是千股，兩者單位不同，
// 分子要先換算成元（x1000）才能除，否則會差 1000 倍（BVPS 曾踩過這個坑）。
const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (companyId: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): EpsResult => ({
  companyId,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  epsQuarterly: null,
  epsQuarterlyAnnualized: null,
  epsTtm: null,
  netIncome: { fieldUsed: null, value: null },
  netIncomeTtm: { value: null },
  paidInShares: { value: null, effectiveYear: null, effectiveMonth: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  warnings,
});

export const calculateEps = async (query: EpsQuery): Promise<EpsResult> => {
  const { companyId, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司損益表有資料」的最新一季，見 shared/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(companyId, dataType, subsidiaryCompanyId, ['incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(companyId, dataType, subsidiaryCompanyId, ['查無任何一季損益表有資料的季度，無法決定要用哪一季計算 EPS。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: { symbol: companyId, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId },
  };

  const currentIncomeStatement = await prisma.quarterlyIncomeStatement.findUnique({ where });
  if (!currentIncomeStatement) warnings.push('查無該季損益表資料。');
  if (subsidiaryCompanyId) {
    warnings.push(
      '已指定 subsidiaryCompanyId：股本歷史資料（capital_stock_history）只有母公司（上市櫃公司本身）的紀錄，這裡查到的流通股數是母公司的股本結構，不是子公司的，EPS 數值請自行判斷是否適用。'
    );
  }

  const netIncome = pickNetIncome(currentIncomeStatement);
  if (currentIncomeStatement && netIncome.value === null) warnings.push('該季損益表淨利相關欄位皆為 null，無法計算。');

  // TTM：近四季（含本季）淨利加總。四季資料需全部存在且淨利欄位皆非 null，否則視為不齊，不會用部分資料湊數字。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const ttmRecords = await Promise.all(
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
  let ttmSum = 0n;
  let ttmComplete = true;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const record = ttmRecords[i]!;
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      ttmSum += picked.value;
    }
  });
  if (!ttmComplete) warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM EPS。`);

  const reportDate = currentIncomeStatement?.reportDate ?? null;

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
      warnings.push('查無本季報告日之前生效的股本歷史資料（capital_stock_history），無法計算 EPS。');
    }
  }
  if (paidInShares !== null && paidInShares <= 0n) warnings.push('流通股數為零或負數，EPS 數值意義有限，請自行判斷是否採用。');

  let epsQuarterly: number | null = null;
  let epsQuarterlyAnnualized: number | null = null;
  if (netIncome.value !== null && paidInShares !== null) {
    epsQuarterly = toPerShare(netIncome.value, paidInShares);
    if (epsQuarterly !== null) epsQuarterlyAnnualized = Math.round(epsQuarterly * 4 * 100) / 100;
  }

  const netIncomeTtmValue = ttmComplete ? ttmSum : null;
  let epsTtm: number | null = null;
  if (netIncomeTtmValue !== null && paidInShares !== null) {
    epsTtm = toPerShare(netIncomeTtmValue, paidInShares);
  }

  // 存進 oingg-analysis DB 的 profitability_eps，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.epsResult.upsert({
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
        epsQuarterly,
        epsQuarterlyAnnualized,
        epsTtm,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        paidInShares,
        capitalStockEffectiveYear: effectiveYear,
        capitalStockEffectiveMonth: effectiveMonth,
        warnings,
      },
      update: {
        reportDate,
        epsQuarterly,
        epsQuarterlyAnnualized,
        epsTtm,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        netIncomeTtmValue,
        paidInShares,
        capitalStockEffectiveYear: effectiveYear,
        capitalStockEffectiveMonth: effectiveMonth,
        warnings,
      },
    });
  } catch (error) {
    console.error('[eps]: 寫入 profitability_eps 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    epsQuarterly,
    epsQuarterlyAnnualized,
    epsTtm,
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    netIncomeTtm: { value: netIncomeTtmValue?.toString() ?? null },
    paidInShares: {
      value: paidInShares?.toString() ?? null,
      effectiveYear,
      effectiveMonth,
    },
    ttm: { quartersUsed, quartersMissing },
    warnings,
  };
};
