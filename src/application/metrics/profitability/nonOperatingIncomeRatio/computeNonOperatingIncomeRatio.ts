import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——業外損益占稅前
// 淨利比，衡量本業獲利跟業外損益（業內外損益 = 稅前淨利 - 營業利益）對稅前淨利的貢獻
// 結構，數值越高代表獲利越依賴非本業活動。單季即可，不需要歷史深度。只有 Q 一種 basis。


export type NonOperatingIncomeRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type NonOperatingIncomeRatioComputationBatch = ComputationBatch<'q'>;

export const computeNonOperatingIncomeRatio = async (query: QuarterlyMetricQuery, deps: NonOperatingIncomeRatioDeps): Promise<NonOperatingIncomeRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;

  const profitBeforeTax = incomeStatement?.profitBeforeTax ?? null;
  const operatingIncome = incomeStatement?.operatingIncome ?? null;
  const nonOperatingIncome = profitBeforeTax !== null && operatingIncome !== null ? profitBeforeTax - operatingIncome : null;

  // 2026-09-22 公式稽核：稅前淨利 ≤ 0 時比率符號會翻轉（稅前虧損、業外正貢獻 → 算出負的「業外依賴度」），沒有意義，
  // 一律 zero_or_negative_denominator（v1 只擋 = 0）。
  const ratio = nonOperatingIncome !== null && profitBeforeTax !== null && profitBeforeTax > 0n ? toPercent(nonOperatingIncome, profitBeforeTax) : null;
  const nullReason: MetricNullReason | null = ratio !== null ? null : nonOperatingIncome === null || profitBeforeTax === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'nonOperatingIncomeRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', ratio, nullReason);

  return { symbol, rocYear: year, season, slots: { q } };
};
