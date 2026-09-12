import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// 量化選股盤點使用者要求新增，簡化版公式見 crociDefinition.ts 的說明（不做 CROCI 原始
// 方法論的通膨/資本化調整）。Economic Capital 用本季期末總資產－流動負債（單一期末值，
// 不平均、不加總，跟 ROE/ROA/CROIC 同一種簡化）。

const pickNetIncome = (record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  return record.netIncome;
};

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface CrociPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteCrociPit = async (query: QuarterlyMetricQuery): Promise<CrociPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await getQuarterlyBalanceSheet(key);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const economicCapital = totalAssets !== null && currentLiabilities !== null ? totalAssets - currentLiabilities : null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  let grossCashFlowTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    const netIncome = pickNetIncome(incomeRecord);
    if (netIncome === null || incomeRecord?.financeCosts == null || cashFlowRecord?.depreciation == null || cashFlowRecord?.amortization == null) {
      ttmComplete = false;
    } else {
      grossCashFlowTtmSum += netIncome + incomeRecord.financeCosts + cashFlowRecord.depreciation + cashFlowRecord.amortization;
    }
  }

  const ttmValue = ttmComplete && economicCapital !== null ? toPct(grossCashFlowTtmSum, economicCapital) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(grossCashFlowTtmSum, economicCapital) : 'insufficient_history';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'croci', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, ttm };
};
