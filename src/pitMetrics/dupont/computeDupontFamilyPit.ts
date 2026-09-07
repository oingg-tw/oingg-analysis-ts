import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案獨立重新實作 src/domainMetrics/margins.ts（僅 netProfitMargin 這個因子）、
// src/domainMetrics/turnoverRatio.ts（僅 assetTurnover 這個因子）、src/domainMetrics/dupont.ts
// 三支舊架構檔案，刻意不呼叫任何一支既有的 calculateXxx()——一次查詢原始財報資料，本地
// 算出全部四個 metric_code（netProfitMargin/assetTurnover/equityMultiplier/dupontDecomposedRoe），
// 共用同一組 knowledge_date 解析結果，不重複查詢也不互相讀取彼此已寫入的 metric_value 列。
//
// 這是 point-in-time 架構第一次遇到「一個概念天生由多個數字組成」的複合指標——metric_values
// 一列只存一個 value，這裡確立的先例是拆成多個獨立 metric_code（各自單一數字、可獨立查
// 歷史），不是修改 schema 塞 JSON 或多欄位。之後 ROIC/ROCE/Nissim-Penman RNOA 這類多因子
// 指標都複用這個先例。

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { value: record.totalEquity };
  return { value: null };
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

// 比率型（「次」）的四捨五入到小數 2 位，跟 turnoverRatio.ts 的 toTurnover 一致。
const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100;
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——負值不擋，
// 沿用既有「扭曲但仍是真實數字」的行為。
const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface DupontFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  netProfitMarginQ: BasisOutcome;
  netProfitMarginTtm: BasisOutcome;
  assetTurnoverQ: BasisOutcome;
  assetTurnoverQAnn: BasisOutcome;
  assetTurnoverTtm: BasisOutcome;
  equityMultiplier: BasisOutcome;
  dupontDecomposedRoeQ: BasisOutcome;
  dupontDecomposedRoeTtm: BasisOutcome;
}

export const computeAndWriteDupontFamilyPit = async (query: QuarterlyMetricQuery): Promise<DupontFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: DupontFamilyPitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    netProfitMarginQ: { action: 'skipped_no_quarter' },
    netProfitMarginTtm: { action: 'skipped_no_quarter' },
    assetTurnoverQ: { action: 'skipped_no_quarter' },
    assetTurnoverQAnn: { action: 'skipped_no_quarter' },
    assetTurnoverTtm: { action: 'skipped_no_quarter' },
    equityMultiplier: { action: 'skipped_no_quarter' },
    dupontDecomposedRoeQ: { action: 'skipped_no_quarter' },
    dupontDecomposedRoeTtm: { action: 'skipped_no_quarter' },
  };

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, balanceSheet] = await Promise.all([getQuarterlyIncomeStatement(key), getQuarterlyBalanceSheet(key)]);

  const netIncome = pickNetIncome(incomeStatement);
  const equity = pickEquity(balanceSheet);
  const operatingRevenue = incomeStatement?.operatingRevenue ?? null;
  const totalAssets = balanceSheet?.totalAssets ?? null;

  const netProfitMarginQuarterlyPct = netIncome.value !== null && operatingRevenue !== null ? toPct(netIncome.value, operatingRevenue) : null;
  const netProfitMarginQuarterlyNullReason: MetricNullReason | null =
    netProfitMarginQuarterlyPct === null ? determineNullReason(netIncome.value, operatingRevenue) : null;

  const assetTurnoverQuarterly = operatingRevenue !== null && totalAssets !== null ? toRatio(operatingRevenue, totalAssets) : null;
  const assetTurnoverQuarterlyAnnualized = assetTurnoverQuarterly !== null ? round2(assetTurnoverQuarterly * 4) : null;
  const assetTurnoverQuarterlyNullReason: MetricNullReason | null =
    assetTurnoverQuarterly === null ? determineNullReason(operatingRevenue, totalAssets) : null;

  const equityMultiplierValue = totalAssets !== null && equity.value !== null ? toRatio(totalAssets, equity.value) : null;
  const equityMultiplierNullReason: MetricNullReason | null = equityMultiplierValue === null ? determineNullReason(totalAssets, equity.value) : null;

  const decomposedRoeQuarterlyPct =
    netProfitMarginQuarterlyPct !== null && assetTurnoverQuarterly !== null && equityMultiplierValue !== null
      ? round2(netProfitMarginQuarterlyPct * assetTurnoverQuarterly * equityMultiplierValue)
      : null;
  // 三個因子任一為 null，不管原因為何，一律回報 missing_input——各因子自己缺漏的細節記在
  // 各自的 metric_value 列上，查歷史時可以自己對照，這裡不重複細分。
  const decomposedRoeQuarterlyNullReason: MetricNullReason | null = decomposedRoeQuarterlyPct === null ? 'missing_input' : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let netProfitMarginQ: BasisOutcome;
  let assetTurnoverQ: BasisOutcome;
  let assetTurnoverQAnn: BasisOutcome;
  let equityMultiplierOutcome: BasisOutcome;
  let dupontDecomposedRoeQ: BasisOutcome;

  if (!mainAnchor) {
    netProfitMarginQ = { action: 'skipped_no_knowledge_date' };
    assetTurnoverQ = { action: 'skipped_no_knowledge_date' };
    assetTurnoverQAnn = { action: 'skipped_no_knowledge_date' };
    equityMultiplierOutcome = { action: 'skipped_no_knowledge_date' };
    dupontDecomposedRoeQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    netProfitMarginQ = await writeMetricValue({
      ...coordinateFor('netProfitMargin'),
      basis: 'Q',
      value: netProfitMarginQuarterlyPct,
      nullReason: netProfitMarginQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    assetTurnoverQ = await writeMetricValue({
      ...coordinateFor('assetTurnover'),
      basis: 'Q',
      value: assetTurnoverQuarterly,
      nullReason: assetTurnoverQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    assetTurnoverQAnn = await writeMetricValue({
      ...coordinateFor('assetTurnover'),
      basis: 'Q_ANN',
      value: assetTurnoverQuarterlyAnnualized,
      nullReason: assetTurnoverQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    equityMultiplierOutcome = await writeMetricValue({
      ...coordinateFor('equityMultiplier'),
      basis: 'Q',
      value: equityMultiplierValue,
      nullReason: equityMultiplierNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontDecomposedRoeQ = await writeMetricValue({
      ...coordinateFor('dupontDecomposedRoe'),
      basis: 'Q',
      value: decomposedRoeQuarterlyPct,
      nullReason: decomposedRoeQuarterlyNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  }

  // TTM：近四季（含本季）營收/淨利加總；assetTurnover 分母沿用「本季期末總資產」（不是加總），
  // 跟 turnoverRatio.ts 的既有簡化一致。一季只要營收或淨利任一為 null 就視為該季不齊，
  // netProfitMargin/assetTurnover 的 TTM 共用同一組「資料齊不齊」判斷（比照 margins.ts）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let revenueTtmSum = 0n;
  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (record === null || record.operatingRevenue === null || picked.value === null) {
      ttmComplete = false;
    } else {
      revenueTtmSum += record.operatingRevenue;
      netIncomeTtmSum += picked.value;
    }
  }

  const netProfitMarginTtmPct = ttmComplete ? toPct(netIncomeTtmSum, revenueTtmSum) : null;
  const assetTurnoverTtmValue = ttmComplete && totalAssets !== null ? toRatio(revenueTtmSum, totalAssets) : null;

  const netProfitMarginTtmNullReason: MetricNullReason | null = ttmComplete
    ? netProfitMarginTtmPct === null
      ? determineNullReason(netIncomeTtmSum, revenueTtmSum)
      : null
    : 'insufficient_history';
  const assetTurnoverTtmNullReason: MetricNullReason | null = ttmComplete
    ? assetTurnoverTtmValue === null
      ? determineNullReason(revenueTtmSum, totalAssets)
      : null
    : 'insufficient_history';

  const decomposedRoeTtmPct =
    netProfitMarginTtmPct !== null && assetTurnoverTtmValue !== null && equityMultiplierValue !== null
      ? round2(netProfitMarginTtmPct * assetTurnoverTtmValue * equityMultiplierValue)
      : null;
  const decomposedRoeTtmNullReason: MetricNullReason | null = decomposedRoeTtmPct !== null ? null : ttmComplete ? 'missing_input' : 'insufficient_history';

  let netProfitMarginTtm: BasisOutcome;
  let assetTurnoverTtm: BasisOutcome;
  let dupontDecomposedRoeTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      netProfitMarginTtm = { action: 'skipped_no_knowledge_date' };
      assetTurnoverTtm = { action: 'skipped_no_knowledge_date' };
      dupontDecomposedRoeTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      netProfitMarginTtm = await writeMetricValue({
        ...coordinateFor('netProfitMargin'),
        basis: 'TTM',
        value: netProfitMarginTtmPct,
        nullReason: netProfitMarginTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      assetTurnoverTtm = await writeMetricValue({
        ...coordinateFor('assetTurnover'),
        basis: 'TTM',
        value: assetTurnoverTtmValue,
        nullReason: assetTurnoverTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      dupontDecomposedRoeTtm = await writeMetricValue({
        ...coordinateFor('dupontDecomposedRoe'),
        basis: 'TTM',
        value: decomposedRoeTtmPct,
        nullReason: decomposedRoeTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    netProfitMarginTtm = await writeMetricValue({
      ...coordinateFor('netProfitMargin'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    assetTurnoverTtm = await writeMetricValue({
      ...coordinateFor('assetTurnover'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    dupontDecomposedRoeTtm = await writeMetricValue({
      ...coordinateFor('dupontDecomposedRoe'),
      basis: 'TTM',
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  } else {
    netProfitMarginTtm = { action: 'skipped_no_knowledge_date' };
    assetTurnoverTtm = { action: 'skipped_no_knowledge_date' };
    dupontDecomposedRoeTtm = { action: 'skipped_no_knowledge_date' };
  }

  return {
    symbol,
    rocYear: year,
    season,
    netProfitMarginQ,
    netProfitMarginTtm,
    assetTurnoverQ,
    assetTurnoverQAnn,
    assetTurnoverTtm,
    equityMultiplier: equityMultiplierOutcome,
    dupontDecomposedRoeQ,
    dupontDecomposedRoeTtm,
  };
};
