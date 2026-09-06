import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getQuarterlyIncomeStatement } from '@/shared/sourceData/mopsQuarterlyStatements';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案獨立重新實作 src/domainMetrics/margins.ts 裡「還沒遷移」的兩個率（毛利率/
// 營業利益率）——netProfitMargin 已經由 src/pitMetrics/dupont/computeDupontFamilyPit.ts
// 寫入，這裡不重複寫。一次查詢拆兩個 metric_code，跟 Dupont 家族同一種模式。
//
// 刻意的行為差異：舊架構 margins.ts 的 TTM 完整度判斷是「營收/毛利/營業利益/淨利」四個
// 欄位共用一個旗標（因為舊架構一次算三個率）。這裡只算毛利率/營業利益率兩個率，TTM
// 完整度判斷只看「營收/毛利/營業利益」三個欄位，不看淨利——不應該因為淨利缺漏就連累
// 毛利率算不出來，這是比舊架構更精確的判斷，不是疏漏。

const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface MarginsFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  grossMarginQ: BasisOutcome;
  grossMarginTtm: BasisOutcome;
  operatingMarginQ: BasisOutcome;
  operatingMarginTtm: BasisOutcome;
}

export const computeAndWriteMarginsFamilyPit = async (query: QuarterlyMetricQuery): Promise<MarginsFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: MarginsFamilyPitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    grossMarginQ: { action: 'skipped_no_quarter' },
    grossMarginTtm: { action: 'skipped_no_quarter' },
    operatingMarginQ: { action: 'skipped_no_quarter' },
    operatingMarginTtm: { action: 'skipped_no_quarter' },
  };

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await getQuarterlyIncomeStatement(key);
  const operatingRevenue = incomeStatement?.operatingRevenue ?? null;
  const grossProfit = incomeStatement?.grossProfit ?? null;
  const operatingIncome = incomeStatement?.operatingIncome ?? null;
  const reportDate = incomeStatement?.reportDate ?? null;

  const grossMarginQuarterly = grossProfit !== null && operatingRevenue !== null ? toPct(grossProfit, operatingRevenue) : null;
  const grossMarginNullReason: MetricNullReason | null = grossMarginQuarterly === null ? determineNullReason(grossProfit, operatingRevenue) : null;

  const operatingMarginQuarterly = operatingIncome !== null && operatingRevenue !== null ? toPct(operatingIncome, operatingRevenue) : null;
  const operatingMarginNullReason: MetricNullReason | null = operatingMarginQuarterly === null ? determineNullReason(operatingIncome, operatingRevenue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let grossMarginQ: BasisOutcome;
  let operatingMarginQ: BasisOutcome;

  if (!mainAnchor) {
    grossMarginQ = { action: 'skipped_no_knowledge_date' };
    operatingMarginQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossMarginQ = await writeMetricValue({ ...coordinateFor('grossMargin'), basis: 'Q', value: grossMarginQuarterly, nullReason: grossMarginNullReason, knowledgeDate, knowledgeDateIsFallback });
    operatingMarginQ = await writeMetricValue({
      ...coordinateFor('operatingMargin'),
      basis: 'Q',
      value: operatingMarginQuarterly,
      nullReason: operatingMarginNullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  }

  // TTM：近四季（含本季）營收/毛利/營業利益各自加總。一季只要這三個欄位任一為 null 就視為
  // 該季不齊——刻意不看淨利（見檔頭說明的行為差異）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let revenueTtmSum = 0n;
  let grossProfitTtmSum = 0n;
  let operatingIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.operatingRevenue === null || record.grossProfit === null || record.operatingIncome === null) {
      ttmComplete = false;
    } else {
      revenueTtmSum += record.operatingRevenue;
      grossProfitTtmSum += record.grossProfit;
      operatingIncomeTtmSum += record.operatingIncome;
    }
  }

  const grossMarginTtmValue = ttmComplete ? toPct(grossProfitTtmSum, revenueTtmSum) : null;
  const operatingMarginTtmValue = ttmComplete ? toPct(operatingIncomeTtmSum, revenueTtmSum) : null;
  const grossMarginTtmNullReason: MetricNullReason | null = grossMarginTtmValue !== null ? null : ttmComplete ? determineNullReason(grossProfitTtmSum, revenueTtmSum) : 'insufficient_history';
  const operatingMarginTtmNullReason: MetricNullReason | null =
    operatingMarginTtmValue !== null ? null : ttmComplete ? determineNullReason(operatingIncomeTtmSum, revenueTtmSum) : 'insufficient_history';

  let grossMarginTtm: BasisOutcome;
  let operatingMarginTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      grossMarginTtm = { action: 'skipped_no_knowledge_date' };
      operatingMarginTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      grossMarginTtm = await writeMetricValue({
        ...coordinateFor('grossMargin'),
        basis: 'TTM',
        value: grossMarginTtmValue,
        nullReason: grossMarginTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
      operatingMarginTtm = await writeMetricValue({
        ...coordinateFor('operatingMargin'),
        basis: 'TTM',
        value: operatingMarginTtmValue,
        nullReason: operatingMarginTtmNullReason,
        knowledgeDate,
        knowledgeDateIsFallback,
      });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossMarginTtm = await writeMetricValue({ ...coordinateFor('grossMargin'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    operatingMarginTtm = await writeMetricValue({ ...coordinateFor('operatingMargin'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    grossMarginTtm = { action: 'skipped_no_knowledge_date' };
    operatingMarginTtm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, grossMarginQ, grossMarginTtm, operatingMarginQ, operatingMarginTtm };
};
