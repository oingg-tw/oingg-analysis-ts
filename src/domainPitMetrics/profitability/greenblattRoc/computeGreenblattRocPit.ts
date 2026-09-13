import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import type { IncomeStatementFields } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { financialDataAdapter, type IncomeStatementPort, type BalanceSheetPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// Greenblatt 資本報酬率 = EBIT(TTM) / (淨營運資金 + 淨固定資產) * 100。分母固定用本季期末
// 資產負債表（不平均不加總，跟 altmanZScore/netDebtToEbitda 的分母處理方式一致）。只有
// TTM 一種 basis。

const toPct2 = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100 * 100) / 100;
};

export interface GreenblattRocTtmQuarterDetail {
  rocYear: number;
  season: number;
  fiscalYear: number;
  profitBeforeTax: bigint | null;
  financeCosts: bigint | null;
  reportDate: Date | null;
}

export interface GreenblattRocResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  propertyPlantEquipment: bigint | null;
  ttmQuarterDetails: GreenblattRocTtmQuarterDetail[];
  ttmComplete: boolean;
  rocTtm: number | null;
  ttmNullReason: MetricNullReason | null;
  mainAnchor: Awaited<ReturnType<typeof resolveKnowledgeDate>>;
}

export const resolveGreenblattRocInputs = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & BalanceSheetPort = financialDataAdapter
): Promise<GreenblattRocResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await statements.getBalanceSheet(key);
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const propertyPlantEquipment = balanceSheet?.propertyPlantEquipment ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords: (IncomeStatementFields | null)[] = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const ttmQuarterDetails: GreenblattRocTtmQuarterDetail[] = ttmQuarters.map((tq, i) => ({
    rocYear: Number(tq.year),
    season: Number(tq.season),
    fiscalYear: rocYearToGregorian(Number(tq.year)),
    profitBeforeTax: ttmRecords[i]?.profitBeforeTax ?? null,
    financeCosts: ttmRecords[i]?.financeCosts ?? null,
    reportDate: ttmRecords[i]?.reportDate ?? null,
  }));

  let ebitTtmSum = 0n;
  let ttmComplete = true;
  for (const detail of ttmQuarterDetails) {
    if (detail.profitBeforeTax === null || detail.financeCosts === null) {
      ttmComplete = false;
    } else {
      ebitTtmSum += detail.profitBeforeTax + detail.financeCosts;
    }
  }

  const capitalEmployed =
    currentAssets !== null && currentLiabilities !== null && propertyPlantEquipment !== null
      ? (currentAssets - currentLiabilities + propertyPlantEquipment) * 1000n
      : null;
  const rocTtm = ttmComplete && capitalEmployed !== null ? toPct2(Number(ebitTtmSum) * 1000, Number(capitalEmployed)) : null;

  let ttmNullReason: MetricNullReason | null = null;
  if (rocTtm === null) {
    ttmNullReason = !ttmComplete ? 'insufficient_history' : capitalEmployed === null ? 'missing_input' : 'zero_or_negative_denominator';
  }

  return {
    symbol,
    rocYear: year,
    season,
    fiscalYear,
    fiscalQuarter: seasonNum,
    currentAssets,
    currentLiabilities,
    propertyPlantEquipment,
    ttmQuarterDetails,
    ttmComplete,
    rocTtm,
    ttmNullReason,
    mainAnchor,
  };
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface GreenblattRocPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ttm: BasisOutcome;
}

export const computeAndWriteGreenblattRocPit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & BalanceSheetPort = financialDataAdapter
): Promise<GreenblattRocPitOutcome> => {
  const resolution = await resolveGreenblattRocInputs(query, statements);
  if (!resolution) {
    return { symbol: query.symbol, rocYear: null, season: null, ttm: { action: 'skipped_no_quarter' } };
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, ttmComplete, ttmQuarterDetails, rocTtm, ttmNullReason, mainAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'greenblattRoc', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  let ttm: BasisOutcome;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarterDetails.map((detail) => ({ rocYear: detail.rocYear, season: detail.season, reportDate: detail.reportDate }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: rocTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    ttm = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear, season, ttm };
};
