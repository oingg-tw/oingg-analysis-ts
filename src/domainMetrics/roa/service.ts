import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus, type MetricResultMeta } from '@/shared/metricStatus';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity, QuarterlyMetricTtmInfo } from '@/shared/quarterlyMetric';
import { logger } from '@/shared/logger';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
export type RoaQuery = QuarterlyMetricQuery;

export interface RoaResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 單季 ROA（未年化）= 本季淨利 / 本季期末總資產 * 100
  roaQuarterlyPct: number | null;
  // 單季 ROA 簡易年化（x4）
  roaQuarterlyAnnualizedPct: number | null;
  // TTM ROA = 近四季（含本季）淨利加總 / 本季期末總資產 * 100；四季資料不齊則為 null
  roaTtmPct: number | null;

  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string
  };
  totalAssets: {
    value: string | null; // BigInt as string
  };

  ttm: QuarterlyMetricTtmInfo;
}

// 淨利欄位選擇邏輯跟 ROE 一致：優先採用「歸屬於母公司」口徑，缺漏時退回用整體數字。
// 注意：教科書上的 ROA 有時會用整體（含少數股權）淨利去對整體總資產，口徑比較「對稱」；
// 這裡為了跟本服務其他指標（ROE、EPS…）一致，維持同一套「先母公司口徑」的選擇邏輯。
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

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): RoaResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  roaQuarterlyPct: null,
  roaQuarterlyAnnualizedPct: null,
  roaTtmPct: null,
  netIncome: { fieldUsed: null, value: null },
  totalAssets: { value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: {},
  warnings,
});

export const calculateRoa = async (query: RoaQuery): Promise<RoaResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季——不同公司財報
  // 申報進度不同步，見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算 ROA。']);
  }
  const { year, season } = resolvedQuarter;
  const yearNum = Number(year);
  const seasonNum = Number(season);

  const key = { symbol: symbol, year: yearNum, quarter: seasonNum, dataType, subsidiaryCompanyId };

  const [incomeStatement, balanceSheet] = await Promise.all([
    getQuarterlyIncomeStatement(key),
    getQuarterlyBalanceSheet(key),
  ]);

  const netIncome = pickNetIncome(incomeStatement);
  const totalAssets = balanceSheet?.totalAssets ?? null;

  if (!incomeStatement) warnings.push('查無該季損益表資料。');
  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');
  if (incomeStatement && netIncome.value === null) warnings.push('該季損益表淨利相關欄位皆為 null，無法計算。');
  if (balanceSheet && totalAssets === null) warnings.push('該季資產負債表總資產欄位為 null，無法計算。');

  let roaQuarterlyPct: number | null = null;
  let roaQuarterlyAnnualizedPct: number | null = null;
  if (netIncome.value !== null && totalAssets !== null) {
    roaQuarterlyPct = toPct(netIncome.value, totalAssets);
    if (roaQuarterlyPct !== null) roaQuarterlyAnnualizedPct = Math.round(roaQuarterlyPct * 4 * 100) / 100;
    if (totalAssets <= 0n) warnings.push('本季期末總資產為零或負數，ROA 數值意義有限，請自行判斷是否採用。');
  }

  // TTM：近四季（含本季）淨利加總 / 本季期末總資產。四季資料需全部存在且淨利欄位皆非 null，否則視為不齊。
  const ttmQuarters = getPastNQuarters({ rocYear: yearNum, season }, 4);
  const ttmRecords = await Promise.all(
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

  let roaTtmPct: number | null = null;
  if (ttmComplete && totalAssets !== null) {
    roaTtmPct = toPct(ttmSum, totalAssets);
  } else if (!ttmComplete) {
    warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM ROA。`);
  }

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    roaQuarterlyPct === null ? ['roaQuarterlyPct', { status: 'no_data', message: '本季淨利或期末總資產缺漏，無法計算 ROA。' }] : null,
    roaTtmPct === null ? ['roaTtmPct', { status: 'no_data', message: '近四季淨利資料不齊，或本季期末總資產缺漏，無法計算 TTM ROA。' }] : null,
  ];

  // 存進 oingg-analysis DB 的 profitability_roa，供之後查歷史紀錄用。存檔失敗不應該讓已經算好的結果回傳失敗。
  try {
    await analysisPrisma.roaResult.upsert({
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
        roaQuarterlyPct,
        roaQuarterlyAnnualizedPct,
        roaTtmPct,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        totalAssetsValue: totalAssets,
        warnings,
      },
      update: {
        reportDate,
        roaQuarterlyPct,
        roaQuarterlyAnnualizedPct,
        roaTtmPct,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        totalAssetsValue: totalAssets,
        warnings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[roa]: 寫入 profitability_roa 失敗，不影響本次回傳結果。');
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    roaQuarterlyPct,
    roaQuarterlyAnnualizedPct,
    roaTtmPct,
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    totalAssets: { value: totalAssets?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
