import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type IncomeStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeOrSkip } from '../../metricValueWriter';
import type { StandardBasisPitOutcome } from '../../pitOutcome';
import type { MetricNullReason } from '../../metricBasis';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——業外損益占稅前
// 淨利比，衡量本業獲利跟業外損益（業內外損益 = 稅前淨利 - 營業利益）對稅前淨利的貢獻
// 結構，數值越高代表獲利越依賴非本業活動。單季即可，不需要歷史深度。只有 Q 一種 basis。

export type NonOperatingIncomeRatioPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteNonOperatingIncomeRatioPit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort = financialDataAdapter): Promise<NonOperatingIncomeRatioPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;

  const profitBeforeTax = incomeStatement?.profitBeforeTax ?? null;
  const operatingIncome = incomeStatement?.operatingIncome ?? null;
  const nonOperatingIncome = profitBeforeTax !== null && operatingIncome !== null ? profitBeforeTax - operatingIncome : null;

  const ratio = nonOperatingIncome !== null && profitBeforeTax !== null ? toPercent(nonOperatingIncome, profitBeforeTax) : null;
  const nullReason: MetricNullReason | null = ratio !== null ? null : nonOperatingIncome === null || profitBeforeTax === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'nonOperatingIncomeRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = await writeOrSkip(mainAnchor, coordinateBase, 'Q', ratio, nullReason);

  return { symbol, rocYear: year, season, q };
};
