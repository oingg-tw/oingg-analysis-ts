import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/models/incomeStatementXbrlFirst';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip, writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

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
}): Promise<bigint | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ research_and_development_expense: bigint | null }[]>`
    SELECT research_and_development_expense FROM "export"."quarterly_income_statement_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;
  return rows[0]?.research_and_development_expense ?? null;
};

export type RdIntensityPitOutcome = StandardBasisPitOutcome;

// 研發費用率 = 研發費用 / 營收 * 100（G-Score 成分）。營收複用既有的
// incomeStatementXbrlFirst（有舊表 fallback），研發費用只查 XBRL 寬表（見上方說明）。
// 跟 grossMargin/operatingExpenseRatio 同一種 Q/TTM 設計，沒有 Q_ANN。
export const computeAndWriteRdIntensityPit = async (query: QuarterlyMetricQuery): Promise<RdIntensityPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [incomeStatement, researchExpense] = await Promise.all([getQuarterlyIncomeStatement(key), getResearchAndDevelopmentExpense(key)]);
  const reportDate = incomeStatement?.reportDate ?? null;
  const revenue = incomeStatement?.operatingRevenue ?? null;

  const ratioQuarterly = researchExpense !== null && revenue !== null ? toPercent(researchExpense, revenue) : null;
  const quarterlyNullReason: MetricNullReason | null =
    ratioQuarterly !== null ? null : researchExpense === null || revenue === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'rdIntensity', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', ratioQuarterly, quarterlyNullReason);

  // TTM：近四季（含本季）研發費用/營收各自加總。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map(async (tq) => {
      const tqKey = { symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId };
      const [tqIncomeStatement, tqResearchExpense] = await Promise.all([getQuarterlyIncomeStatement(tqKey), getResearchAndDevelopmentExpense(tqKey)]);
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

  let ttm: BasisOutcome;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = await writeMetricValue({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: ratioTtm,
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

  return { symbol, rocYear: year, season, q, ttm };
};
