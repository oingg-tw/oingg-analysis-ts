import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { ZmijewskiScoreQuery, ZmijewskiScoreResult } from './types';

// 標準常態累積分布函數的 Abramowitz & Stegun 近似公式（26.2.17），誤差 <= 7.5e-8，
// 不需要額外的統計函式庫。Zmijewski 原始模型是 Probit，這裡把原始分數 X 轉成機率給使用者看，
// 比單看 X 這個沒有直覺單位的數字好解讀。
const normalCdf = (x: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
};

// 淨利欄位選擇邏輯跟 ROE/ROA/ROIC 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { field: 'netIncomeAttributableToParent' | 'netIncome' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.netIncomeAttributableToParent !== null) return { field: 'netIncomeAttributableToParent', value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { field: 'netIncome', value: record.netIncome };
  return { field: null, value: null };
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): ZmijewskiScoreResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  xScore: null,
  probabilityOfDistress: null,
  flagged: null,
  netIncomeTtm: { fieldUsed: null, value: null },
  totalAssets: { value: null },
  totalLiabilities: { value: null },
  currentAssets: { value: null },
  currentLiabilities: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: buildFieldStatuses([]),
  warnings,
});

export const calculateZmijewskiScore = async (query: ZmijewskiScoreQuery): Promise<ZmijewskiScoreResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算 Zmijewski Score。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId });
  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  if (balanceSheet && totalAssets === null) warnings.push('該季資產負債表總資產欄位為 null，無法計算。');
  if (balanceSheet && totalLiabilities === null) warnings.push('該季資產負債表總負債欄位為 null，無法計算。');
  if (balanceSheet && (currentAssets === null || currentLiabilities === null)) {
    warnings.push('該季資產負債表流動資產/流動負債欄位為 null——常見於金融/保險業（資產負債表不按流動/非流動分類），流動性項無法計算。');
  }

  // NI 用 TTM（近四季加總）而不是單季——Zmijewski 原始模型是用年度財報校準的，TTM 是年度數字
  // 最接近的替代口徑，跟 ROE/ROA 的 TTM 邏輯一致。
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

  const quartersUsed: string[] = [];
  const quartersMissing: string[] = [];
  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  let netIncomeFieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null = null;
  ttmQuarters.forEach((q, i) => {
    const label = `${q.year}Q${q.season}`;
    const picked = pickNetIncome(ttmIncomeRecords[i]!);
    if (picked.value === null) {
      quartersMissing.push(label);
      ttmComplete = false;
    } else {
      quartersUsed.push(label);
      netIncomeTtmSum += picked.value;
      netIncomeFieldUsed = picked.field;
    }
  });
  if (!ttmComplete) warnings.push(`近四季損益表資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM 淨利，無法計算 Zmijewski Score。`);

  const netIncomeTtmValue = ttmComplete ? netIncomeTtmSum : null;

  let xScore: number | null = null;
  let probabilityOfDistress: number | null = null;
  let flagged: boolean | null = null;
  if (netIncomeTtmValue !== null && totalAssets !== null && totalLiabilities !== null && currentAssets !== null && currentLiabilities !== null) {
    if (totalAssets === 0n || currentLiabilities === 0n) {
      warnings.push('總資產或流動負債為零，無法計算比率，Zmijewski Score 無法計算。');
    } else {
      const roa = Number(netIncomeTtmValue) / Number(totalAssets);
      const leverage = Number(totalLiabilities) / Number(totalAssets);
      const currentRatio = Number(currentAssets) / Number(currentLiabilities);
      xScore = Math.round((-4.3 - 4.5 * roa + 5.7 * leverage - 0.004 * currentRatio) * 10000) / 10000;
      probabilityOfDistress = Math.round(normalCdf(xScore) * 10000) / 10000;
      flagged = probabilityOfDistress > 0.5;
    }
  }

  const reportDate = balanceSheet?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    xScore === null
      ? ['xScore', { status: 'no_data', message: '淨利（TTM）、總資產、總負債、流動資產或流動負債任一缺漏，無法計算 Zmijewski Score。' }]
      : null,
  ];

  // 存進 oingg-analysis DB 的 guru_zmijewski_score，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.zmijewskiScoreResult.upsert({
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
        xScore,
        probabilityOfDistress,
        flagged,
        netIncomeTtmFieldUsed: netIncomeFieldUsed,
        netIncomeTtmValue,
        totalAssetsValue: totalAssets,
        totalLiabilitiesValue: totalLiabilities,
        currentAssetsValue: currentAssets,
        currentLiabilitiesValue: currentLiabilities,
        warnings,
      },
      update: {
        reportDate,
        xScore,
        probabilityOfDistress,
        flagged,
        netIncomeTtmFieldUsed: netIncomeFieldUsed,
        netIncomeTtmValue,
        totalAssetsValue: totalAssets,
        totalLiabilitiesValue: totalLiabilities,
        currentAssetsValue: currentAssets,
        currentLiabilitiesValue: currentLiabilities,
        warnings,
      },
    });
  } catch (error) {
    console.error('[zmijewski-score]: 寫入 guru_zmijewski_score 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    xScore,
    probabilityOfDistress,
    flagged,
    netIncomeTtm: { fieldUsed: netIncomeFieldUsed, value: netIncomeTtmValue?.toString() ?? null },
    totalAssets: { value: totalAssets?.toString() ?? null },
    totalLiabilities: { value: totalLiabilities?.toString() ?? null },
    currentAssets: { value: currentAssets?.toString() ?? null },
    currentLiabilities: { value: currentLiabilities?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
