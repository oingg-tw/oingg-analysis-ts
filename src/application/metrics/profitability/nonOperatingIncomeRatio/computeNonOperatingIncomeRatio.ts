import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingIncomeStatements, sumTrailingPeriods } from '@/application/metrics/shared/trailingYear';
import { annualReportSlot, resolveAnnualReportContext } from '@/application/metrics/shared/annualReportSlot';
import type { Season } from '@/domain/calendar/rocQuarter';
import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——業外損益占稅前
// 淨利比，衡量本業獲利跟業外損益（業內外損益 = 稅前淨利 - 營業利益）對稅前淨利的貢獻
// 結構，數值越高代表獲利越依賴非本業活動。單季即可，不需要歷史深度。只有 Q 一種 basis。


export type NonOperatingIncomeRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'cumulativeStatements' | 'annualReports' | 'shares'>;

// 業外損益占稅前淨利比（Q／TTM／FY 共用）：稅前淨利 ≤ 0 不計算（見下方 2026-09-22 說明）。
const calculateNonOperatingIncomeRatio = (profitBeforeTax: bigint | null, operatingIncome: bigint | null): CalcResult => {
  const nonOperatingIncome = profitBeforeTax !== null && operatingIncome !== null ? profitBeforeTax - operatingIncome : null;
  const value = nonOperatingIncome !== null && profitBeforeTax !== null && profitBeforeTax > 0n ? toPercent(nonOperatingIncome, profitBeforeTax) : null;
  return { value, nullReason: value !== null ? null : nonOperatingIncome === null || profitBeforeTax === null ? 'missing_input' : 'zero_or_negative_denominator' };
};

export type NonOperatingIncomeRatioComputationBatch = ComputationBatch<'q' | 'ttm' | 'fy'>;

export const computeNonOperatingIncomeRatio = async (query: QuarterlyMetricQuery, deps: NonOperatingIncomeRatioDeps): Promise<NonOperatingIncomeRatioComputationBatch> => {
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
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;

  // 2026-09-22 公式稽核：稅前淨利 ≤ 0 時比率符號會翻轉（稅前虧損、業外正貢獻 → 算出負的「業外依賴度」），沒有意義，
  // 一律 zero_or_negative_denominator（v1 只擋 = 0）。
  const { value: ratio, nullReason } = calculateNonOperatingIncomeRatio(incomeStatement?.profitBeforeTax ?? null, incomeStatement?.operatingIncome ?? null);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateBase = { symbol, metricCode: 'nonOperatingIncomeRatio', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', ratio, nullReason);

  // 2026-10-05 近四季（TTM）與年度（FY）：web-nuxt 指標頁要期別切換器（使用者：有頁面要用再做）。TTM＝近四季稅前淨利、營業利益各自加總；
  // FY＝年報全年。近四季不齊為 insufficient_history。
  const { periods } = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const pretaxTtm = sumTrailingPeriods(periods, (r) => r.profitBeforeTax);
  const operatingTtm = sumTrailingPeriods(periods, (r) => r.operatingIncome);
  const ttmCalc: CalcResult = pretaxTtm === null || operatingTtm === null ? { value: null, nullReason: 'insufficient_history' } : calculateNonOperatingIncomeRatio(pretaxTtm, operatingTtm);
  const ttm = periodSlot(mainAnchor, coordinateBase, 'TTM', ttmCalc.value, ttmCalc.nullReason);
  const annual = await resolveAnnualReportContext({ symbol, rocYear, season: seasonNum, dataType, subsidiaryCompanyId }, deps);
  const fy = annualReportSlot(annual, { symbol, metricCode: 'nonOperatingIncomeRatio', dataType, subsidiaryCompanyId }, calculateNonOperatingIncomeRatio(annual?.annual.profitBeforeTax ?? null, annual?.annual.operatingIncome ?? null));

  return { symbol, rocYear: year, season, slots: { q, ttm, fy } };
};
