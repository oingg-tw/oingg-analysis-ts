import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingBankAwareIncome, withBankAnnualIncome, withBankIncome } from '@/application/metrics/shared/bankAwareIncome';
import { annualReportSlot, resolveAnnualReportContext } from '@/application/metrics/shared/annualReportSlot';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const REVENUE_PER_SHARE_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/revenuePerShare.ts 的獨立重新實作，結構跟 computeEpsPit.ts
// 幾乎一模一樣，差別只在分子換成營收（不需要 pickNetIncome 那種欄位選擇邏輯）。


export type RevenuePerShareDeps = Pick<PitDeps, 'statements' | 'annualReports' | 'quarters' | 'announcements' | 'shares' | 'cumulativeStatements'>;

export type RevenuePerShareComputationBatch = ComputationBatch<'q' | 'ttm' | 'fy'>;

export const computeRevenuePerShare = async (query: QuarterlyMetricQuery, deps: RevenuePerShareDeps): Promise<RevenuePerShareComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm', 'fy']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  // 2026-10-08 純銀行改用銀行口徑營收（利息收入總額＋非利息淨收益，見 shared/bankAwareIncome.ts）；一般公司原樣。
  const incomeStatement = await withBankIncome(await deps.statements.getIncomeStatement(key), key, deps);
  const operatingRevenue = incomeStatement?.operatingRevenue ?? null;
  const reportDate = incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const sharesValue = shares?.outstandingCommonShares ?? null;

  const quarterly = operatingRevenue !== null && sharesValue !== null ? toPerShare(operatingRevenue, sharesValue) : null;
  const quarterlyNullReason: MetricNullReason | null = quarterly === null ? determineNullReason(operatingRevenue, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const coordinateBase = { symbol, metricCode: 'revenuePerShare', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', quarterly, quarterlyNullReason);

  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingBankAwareIncome({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);

  let ttmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      ttmSum += record.operatingRevenue;
    }
  }

  const ttmValue = ttmComplete && sharesValue !== null ? toPerShare(ttmSum, sharesValue) : null;
  const ttmNullReason: MetricNullReason | null = ttmValue !== null ? null : ttmComplete ? determineNullReason(ttmSum, sharesValue) : 'insufficient_history';

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ttmValue,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
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

  // FY（2026-09-25）：年報營收 ÷ 反推的全年加權平均股數（shared/annualReportSlot.ts）。
  const annual = await resolveAnnualReportContext({ symbol, rocYear, season: seasonNum, dataType, subsidiaryCompanyId }, deps);
  const annualRevenue = annual ? ((await withBankAnnualIncome(annual.annual, { symbol, rocYear: annual.fiscalYear - 1911, dataType, subsidiaryCompanyId }, deps))?.operatingRevenue ?? null) : null;
  const annualShares = annual?.weightedShares ?? null;
  const fyValue = annualRevenue !== null && annualShares !== null ? toPerShare(annualRevenue, annualShares) : null;
  const fy = annualReportSlot(
    annual,
    { symbol, metricCode: 'revenuePerShare', dataType, subsidiaryCompanyId },
    { value: fyValue, nullReason: fyValue === null ? determineNullReason(annualRevenue, annualShares) : null }
  );

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ q, ttm, fy }, REVENUE_PER_SHARE_FORMULA_VERSION) };
};
