import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import { negativeEquityWarning } from '@/shared/negativeEquityGuard';
import { getPastNQuarters } from '@/shared/rocQuarter';
import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyBalanceSheet, getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { RoeQuery, RoeResult } from './types';

// 淨利/權益欄位選擇邏輯：優先採用「歸屬於母公司」口徑（分子分母範圍一致），
// 缺漏時（例如部分產業因科目歧義而解析不到細項）退回用整體數字。
const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { field: 'netIncomeAttributableToParent' | 'netIncome' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.netIncomeAttributableToParent !== null) return { field: 'netIncomeAttributableToParent', value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { field: 'netIncome', value: record.netIncome };
  return { field: null, value: null };
};

const pickEquity = (
  record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null
): { field: 'equityAttributableToParent' | 'totalEquity' | null; value: bigint | null } => {
  if (!record) return { field: null, value: null };
  if (record.equityAttributableToParent !== null) return { field: 'equityAttributableToParent', value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { field: 'totalEquity', value: record.totalEquity };
  return { field: null, value: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100; // 四捨五入到小數 2 位
};

const emptyResult = (symbol: string, dataType: '1' | '2', subsidiaryCompanyId: string, warnings: string[]): RoeResult => ({
  symbol,
  year: null,
  season: null,
  dataType,
  subsidiaryCompanyId,
  reportDate: null,
  roeQuarterlyPct: null,
  roeQuarterlyAnnualizedPct: null,
  roeTtmPct: null,
  netIncome: { fieldUsed: null, value: null },
  equity: { fieldUsed: null, value: null },
  ttm: { quartersUsed: [], quartersMissing: [] },
  fieldStatuses: {},
  warnings,
});

export const calculateRoe = async (query: RoeQuery): Promise<RoeResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const warnings: string[] = [];

  // year/season 沒指定時，自動抓「這家公司資產負債表跟損益表都有資料」的最新一季——不同公司財報
  // 申報進度不同步（實測驗證過：2887 損益表曾經卡在比資產負債表舊 3 季），見 shared/sourceData/latestQuarter.ts。
  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined ? { year: query.year, season: query.season } : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);
  if (!resolvedQuarter) {
    return emptyResult(symbol, dataType, subsidiaryCompanyId, ['查無任何一季資產負債表/損益表都有資料的季度，無法決定要用哪一季計算 ROE。']);
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
  const equity = pickEquity(balanceSheet);

  if (!incomeStatement) warnings.push('查無該季損益表資料。');
  if (!balanceSheet) warnings.push('查無該季資產負債表資料。');
  if (incomeStatement && netIncome.value === null) warnings.push('該季損益表淨利相關欄位皆為 null，無法計算。');
  if (balanceSheet && equity.value === null) warnings.push('該季資產負債表權益相關欄位皆為 null，無法計算。');

  let roeQuarterlyPct: number | null = null;
  let roeQuarterlyAnnualizedPct: number | null = null;
  if (netIncome.value !== null && equity.value !== null) {
    roeQuarterlyPct = toPct(netIncome.value, equity.value);
    if (roeQuarterlyPct !== null) roeQuarterlyAnnualizedPct = Math.round(roeQuarterlyPct * 4 * 100) / 100;
    const equityWarning = negativeEquityWarning(equity.value, 'ROE');
    if (equityWarning) warnings.push(equityWarning);
  }

  // TTM：近四季（含本季）淨利加總 / 本季期末權益。四季資料需全部存在且淨利欄位皆非 null，否則視為不齊。
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

  let roeTtmPct: number | null = null;
  if (ttmComplete && equity.value !== null) {
    roeTtmPct = toPct(ttmSum, equity.value);
  } else if (!ttmComplete) {
    warnings.push(`近四季資料不齊（缺: ${quartersMissing.join(', ')}），無法計算 TTM ROE。`);
  }

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  const fieldStatusEntries: Array<[string, MetricStatus] | null> = [
    roeQuarterlyPct === null ? ['roeQuarterlyPct', { status: 'no_data', message: '本季淨利或期末權益缺漏，無法計算 ROE。' }] : null,
    roeTtmPct === null ? ['roeTtmPct', { status: 'no_data', message: '近四季淨利資料不齊，或本季期末權益缺漏，無法計算 TTM ROE。' }] : null,
  ];

  // 把算完的結果存進 oingg-analysis DB 的 profitability_roe，供之後查歷史紀錄用。
  // 這是額外的存檔動作，不是這支 API 的主要契約——存檔失敗不應該讓已經算好的 ROE 回傳失敗。
  try {
    await analysisPrisma.roeResult.upsert({
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
        roeQuarterlyPct,
        roeQuarterlyAnnualizedPct,
        roeTtmPct,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        equityFieldUsed: equity.field,
        equityValue: equity.value,
        warnings,
      },
      update: {
        reportDate,
        roeQuarterlyPct,
        roeQuarterlyAnnualizedPct,
        roeTtmPct,
        netIncomeFieldUsed: netIncome.field,
        netIncomeValue: netIncome.value,
        equityFieldUsed: equity.field,
        equityValue: equity.value,
        warnings,
      },
    });
  } catch (error) {
    console.error('[roe]: 寫入 profitability_roe 失敗，不影響本次回傳結果。', error);
  }

  return {
    symbol,
    year,
    season,
    dataType,
    subsidiaryCompanyId,
    reportDate: reportDate?.toISOString().slice(0, 10) ?? null,
    roeQuarterlyPct,
    roeQuarterlyAnnualizedPct,
    roeTtmPct,
    netIncome: { fieldUsed: netIncome.field, value: netIncome.value?.toString() ?? null },
    equity: { fieldUsed: equity.field, value: equity.value?.toString() ?? null },
    ttm: { quartersUsed, quartersMissing },
    fieldStatuses: buildFieldStatuses(fieldStatusEntries),
    warnings,
  };
};
