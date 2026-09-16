import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 研發費用（research_and_development_expense）只存在 XBRL 損益表寬表，舊表
// quarterly_income_statement 沒有對應欄位、沒有 fallback 可用——跟 buybackYield 的
// payments_to_acquire_treasury_shares 同一種情況，所以不走共用的
// incomeStatementXbrlFirst.ts（那支刻意維持跟舊表相容的 11 個欄位，見檔頭說明），這裡
// 直接查寬表這一個欄位。查無整列 XBRL 資料（該季完全沒有 XBRL 申報）時研發費用視為缺漏
// （missing_input），不猜測是「真的沒有研發費用」還是「還沒回填」。
const getResearchAndDevelopmentExpense = async (key: {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}, deps: RdIntensityDeps): Promise<bigint | null> => {
  return deps.xbrlAccounts.getResearchAndDevelopmentExpense(key);
};


export type RdIntensityDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'xbrlAccounts'>;

export type RdIntensityComputationBatch = ComputationBatch<'q' | 'ttm'>;

// 研發費用率 = 研發費用 / 營收 * 100（G-Score 成分）。營收複用既有的
// incomeStatementXbrlFirst（有舊表 fallback），研發費用只查 XBRL 寬表（見上方說明）。
// 跟 grossMargin/operatingExpenseRatio 同一種 Q/TTM 設計，沒有 Q_ANN。
export const computeRdIntensity = async (query: QuarterlyMetricQuery, deps: RdIntensityDeps): Promise<RdIntensityComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, researchExpense] = await Promise.all([deps.statements.getIncomeStatement(key), getResearchAndDevelopmentExpense(key, deps)]);
  const reportDate = incomeStatement?.reportDate ?? null;
  const revenue = incomeStatement?.operatingRevenue ?? null;

  const ratioQuarterly = researchExpense !== null && revenue !== null ? toPercent(researchExpense, revenue) : null;
  const quarterlyNullReason: MetricNullReason | null =
    ratioQuarterly !== null ? null : researchExpense === null || revenue === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'rdIntensity', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', ratioQuarterly, quarterlyNullReason);

  // TTM：近四季（含本季）研發費用/營收各自加總。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map(async (tq) => {
      const tqKey = { symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId };
      const [tqIncomeStatement, tqResearchExpense] = await Promise.all([deps.statements.getIncomeStatement(tqKey), getResearchAndDevelopmentExpense(tqKey, deps)]);
      return { revenue: tqIncomeStatement?.operatingRevenue ?? null, researchExpense: tqResearchExpense, reportDate: tqIncomeStatement?.reportDate ?? null };
    })
  );

  let researchTtmSum = 0n;
  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record.revenue === null || record.researchExpense === null) {
      ttmComplete = false;
    } else {
      researchTtmSum += record.researchExpense;
      revenueTtmSum += record.revenue;
    }
  }

  const ratioTtm = ttmComplete ? toPercent(researchTtmSum, revenueTtmSum) : null;
  const ttmNullReason: MetricNullReason | null = ratioTtm !== null ? null : !ttmComplete ? 'insufficient_history' : 'zero_or_negative_denominator';

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
        value: ratioTtm,
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

  return { symbol, rocYear: year, season, slots: { q, ttm } };
};
