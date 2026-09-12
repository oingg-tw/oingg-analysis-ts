import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getMarketCapAsOf } from '@/shared/sourceData/marketCap';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// 量化選股盤點使用者要求新增。研發費用查法同 rdIntensity（只有 XBRL 寬表有這個欄位，
// 舊表沒有 fallback）；市值查詢邏輯同 evEbitda/psr。只有 TTM 一種 basis。

const getResearchAndDevelopmentExpense = async (key: { symbol: string; year: number; quarter: number; dataType: string; subsidiaryCompanyId: string }): Promise<bigint | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ research_and_development_expense: bigint | null }[]>`
    SELECT research_and_development_expense FROM "export"."quarterly_income_statement_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;
  return rows[0]?.research_and_development_expense ?? null;
};

const toMultipleFromThousands = (numerator: number, amountInThousands: bigint): number | null => {
  const denominator = Number(amountInThousands) * 1000;
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface PriceToResearchRatioPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWritePriceToResearchRatioPit = async (query: QuarterlyMetricQuery): Promise<PriceToResearchRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const currentIncome = await getQuarterlyIncomeStatement(key);
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: currentIncome?.reportDate ?? null }]);
  const marketCap = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const rdRecords = await Promise.all(
    ttmQuarters.map((tq) => getResearchAndDevelopmentExpense({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let rdTtmSum = 0n;
  let ttmComplete = true;
  for (const rd of rdRecords) {
    if (rd === null) {
      ttmComplete = false;
    } else {
      rdTtmSum += rd;
    }
  }

  const ttmValue = ttmComplete && marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, rdTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? (marketCap === null ? 'missing_input' : 'zero_or_negative_denominator') : 'insufficient_history';

  const coordinateBase = { symbol, metricCode: 'priceToResearchRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: ttmValue,
      nullReason: ttmNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, ttm };
};
