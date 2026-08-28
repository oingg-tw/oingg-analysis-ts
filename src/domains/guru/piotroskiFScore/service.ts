import prisma from '@/adapters/prisma/index';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import { getPaidInSharesAsOf } from '@/shared/capitalStock';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { PiotroskiFScoreQuery, PiotroskiFScoreResult, PiotroskiSignal } from './types';

// 淨利欄位選擇邏輯跟 ROE/EPS 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  return record.netIncome;
};

interface QuarterData {
  netIncome: bigint | null;
  totalAssets: bigint | null;
  operatingCashFlow: bigint | null;
  longTermBorrowings: bigint | null;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  grossProfit: bigint | null;
  operatingRevenue: bigint | null;
  paidInShares: bigint | null;
  reportDate: Date | null;
}

const fetchQuarterData = async (
  companyId: string,
  year: string,
  season: Season,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<QuarterData> => {
  const where = {
    symbol_year_quarter_dataType_subsidiaryCompanyId: {
      symbol: companyId,
      year: Number(year),
      quarter: Number(season),
      dataType,
      subsidiaryCompanyId,
    },
  };

  const [balanceSheet, incomeStatement, cashFlow] = await Promise.all([
    prisma.quarterlyBalanceSheet.findUnique({ where }),
    prisma.quarterlyIncomeStatement.findUnique({ where }),
    prisma.quarterlyCashFlowStatement.findUnique({ where }),
  ]);

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlow?.reportDate ?? null;
  const paidInShares = reportDate ? (await getPaidInSharesAsOf(companyId, reportDate))?.paidInShares ?? null : null;

  return {
    netIncome: pickNetIncome(incomeStatement),
    totalAssets: balanceSheet?.totalAssets ?? null,
    operatingCashFlow: cashFlow?.netCashFromOperatingActivities ?? null,
    longTermBorrowings: balanceSheet?.longTermBorrowings ?? null,
    currentAssets: balanceSheet?.currentAssets ?? null,
    currentLiabilities: balanceSheet?.currentLiabilities ?? null,
    grossProfit: incomeStatement?.grossProfit ?? null,
    operatingRevenue: incomeStatement?.operatingRevenue ?? null,
    paidInShares,
    reportDate,
  };
};

// 兩個 bigint 相除算比率，任一為 null 或分母為 0 回傳 null。
const ratio = (numerator: bigint | null, denominator: bigint | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0n) return null;
  return Number(numerator) / Number(denominator);
};

export const calculatePiotroskiFScore = async (query: PiotroskiFScoreQuery): Promise<PiotroskiFScoreResult> => {
  const { companyId, year, season, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // 「去年同季」= 用 getPastNQuarters 往前推 5 季（含本季），取最舊那一筆——跟每支算 TTM 的 API
  // 定位「近四季」是同一個 helper，只是這裡只需要頭尾兩個點，不是四季加總。
  const fiveQuartersBack = getPastNQuarters({ rocYear: Number(year), season }, 5);
  const prior = fiveQuartersBack[0]!;

  const [curr, prev] = await Promise.all([
    fetchQuarterData(companyId, year, season, dataType, subsidiaryCompanyId),
    fetchQuarterData(companyId, prior.year, prior.season, dataType, subsidiaryCompanyId),
  ]);

  if (!curr.reportDate) warnings.push(`查無 ${year}Q${season} 的財報資料（資產負債表/損益表/現金流量表皆查無）。`);
  if (!prev.reportDate) warnings.push(`查無去年同季 ${prior.year}Q${prior.season} 的財報資料，9 項訊號都無法比較。`);

  const currRoa = ratio(curr.netIncome, curr.totalAssets);
  const prevRoa = ratio(prev.netIncome, prev.totalAssets);
  const currLeverage = ratio(curr.longTermBorrowings ?? 0n, curr.totalAssets);
  const prevLeverage = ratio(prev.longTermBorrowings ?? 0n, prev.totalAssets);
  const currLiquidity = ratio(curr.currentAssets, curr.currentLiabilities);
  const prevLiquidity = ratio(prev.currentAssets, prev.currentLiabilities);
  const currMargin = ratio(curr.grossProfit, curr.operatingRevenue);
  const prevMargin = ratio(prev.grossProfit, prev.operatingRevenue);
  const currTurnover = ratio(curr.operatingRevenue, curr.totalAssets);
  const prevTurnover = ratio(prev.operatingRevenue, prev.totalAssets);

  const signals: PiotroskiSignal[] = [
    { key: 'positiveRoa', name: 'ROA 為正（本季淨利/總資產 > 0）', passed: currRoa === null ? null : currRoa > 0 },
    { key: 'positiveCfo', name: '營運現金流為正（本季 CFO > 0）', passed: curr.operatingCashFlow === null ? null : curr.operatingCashFlow > 0n },
    {
      key: 'roaImproved',
      name: 'ROA 較去年同季提升',
      passed: currRoa === null || prevRoa === null ? null : currRoa > prevRoa,
    },
    {
      key: 'accrualQuality',
      name: '盈餘品質（CFO > 本季淨利）',
      passed: curr.operatingCashFlow === null || curr.netIncome === null ? null : curr.operatingCashFlow > curr.netIncome,
    },
    {
      key: 'leverageDecreased',
      name: '長期負債比率較去年同季下降',
      passed: currLeverage === null || prevLeverage === null ? null : currLeverage < prevLeverage,
    },
    {
      key: 'liquidityImproved',
      name: '流動比率較去年同季提升',
      passed: currLiquidity === null || prevLiquidity === null ? null : currLiquidity > prevLiquidity,
    },
    {
      key: 'noDilution',
      name: '流通股數沒有較去年同季增加（無稀釋）',
      passed: curr.paidInShares === null || prev.paidInShares === null ? null : curr.paidInShares <= prev.paidInShares,
    },
    {
      key: 'grossMarginImproved',
      name: '毛利率較去年同季提升',
      passed: currMargin === null || prevMargin === null ? null : currMargin > prevMargin,
    },
    {
      key: 'assetTurnoverImproved',
      name: '總資產週轉率較去年同季提升',
      passed: currTurnover === null || prevTurnover === null ? null : currTurnover > prevTurnover,
    },
  ];

  // 9 項全部能判斷才給分數——不會用「幾項算出來就算幾項」湊一個打折的分數。
  const allEvaluated = signals.every((s) => s.passed !== null);
  const score = allEvaluated ? signals.reduce((sum, s) => sum + (s.passed ? 1 : 0), 0) : null;

  if (!allEvaluated) {
    const missing = signals.filter((s) => s.passed === null).map((s) => s.name);
    warnings.push(`以下訊號因資料缺漏無法判斷，總分無法計算：${missing.join('、')}。`);
  }

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = signals.map((s) =>
    s.passed === null
      ? [
          s.key,
          {
            status: 'no_data' as const,
            message: !curr.reportDate
              ? `查無 ${year}Q${season} 的財報資料。`
              : !prev.reportDate
                ? `查無去年同季 ${prior.year}Q${prior.season} 的財報資料。`
                : '本季或去年同季的必要欄位缺漏。',
          },
        ]
      : null
  );
  if (score === null) {
    fieldStatusEntries.push(['score', { status: 'no_data', message: '9 項訊號任一無法判斷，無法計算總分，見各訊號的 fieldStatuses。' }]);
  }

  // 存進 oingg-analysis DB 的 guru_piotroski_f_score，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.piotroskiFScoreResult.upsert({
      where: {
        symbol_year_season_dataType_subsidiaryCompanyId: {
          symbol: companyId,
          year: Number(year),
          season: Number(season),
          dataType,
          subsidiaryCompanyId,
        },
      },
      create: {
        symbol: companyId,
        year: Number(year),
        season: Number(season),
        dataType,
        subsidiaryCompanyId,
        reportDate: curr.reportDate,
        score,
        positiveRoa: signals[0]!.passed,
        positiveCfo: signals[1]!.passed,
        roaImproved: signals[2]!.passed,
        accrualQuality: signals[3]!.passed,
        leverageDecreased: signals[4]!.passed,
        liquidityImproved: signals[5]!.passed,
        noDilution: signals[6]!.passed,
        grossMarginImproved: signals[7]!.passed,
        assetTurnoverImproved: signals[8]!.passed,
        priorYear: Number(prior.year),
        priorSeason: Number(prior.season),
        priorReportDate: prev.reportDate,
        warnings,
      },
      update: {
        reportDate: curr.reportDate,
        score,
        positiveRoa: signals[0]!.passed,
        positiveCfo: signals[1]!.passed,
        roaImproved: signals[2]!.passed,
        accrualQuality: signals[3]!.passed,
        leverageDecreased: signals[4]!.passed,
        liquidityImproved: signals[5]!.passed,
        noDilution: signals[6]!.passed,
        grossMarginImproved: signals[7]!.passed,
        assetTurnoverImproved: signals[8]!.passed,
        priorYear: Number(prior.year),
        priorSeason: Number(prior.season),
        priorReportDate: prev.reportDate,
        warnings,
      },
    });
  } catch (error) {
    console.error('[piotroski-f-score]: 寫入 guru_piotroski_f_score 失敗，不影響本次回傳結果。', error);
  }

  return {
    companyId,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: curr.reportDate ? curr.reportDate.toISOString().slice(0, 10) : null,
    score,
    maxScore: 9,
    signals,
    priorYear: prior.year,
    priorSeason: prior.season,
    priorReportDate: prev.reportDate ? prev.reportDate.toISOString().slice(0, 10) : null,
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
