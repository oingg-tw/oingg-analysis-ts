import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import type { IncomeStatementFields } from '@/application/ports/financialStatements';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

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
  deps: GreenblattRocDeps
): Promise<GreenblattRocResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const propertyPlantEquipment = balanceSheet?.propertyPlantEquipment ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords: (IncomeStatementFields | null)[] = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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


export type GreenblattRocDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type GreenblattRocComputationBatch = ComputationBatch<'ttm'>;

export const computeGreenblattRoc = async (
  query: QuarterlyMetricQuery,
  deps: GreenblattRocDeps
): Promise<GreenblattRocComputationBatch> => {
  const resolution = await resolveGreenblattRocInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(query.symbol, ['ttm']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, ttmComplete, ttmQuarterDetails, rocTtm, ttmNullReason, mainAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'greenblattRoc', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  let ttm: ComputationSlot;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarterDetails.map((detail) => ({ rocYear: detail.rocYear, season: detail.season, reportDate: detail.reportDate })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: rocTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else {
    ttm = computation({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear, season, slots: { ttm } };
};
