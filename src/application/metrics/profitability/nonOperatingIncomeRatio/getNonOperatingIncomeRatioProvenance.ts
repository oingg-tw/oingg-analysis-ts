import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/infrastructure/repositories/mops/incomeStatementXbrlFirst';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——nonOperatingIncomeRatio = (稅前淨利 - 營業利益) /
// 稅前淨利，單季即可，只有 Q 一種 basis，不需要 TTM。

export const getNonOperatingIncomeRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'nonOperatingIncomeRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await getQuarterlyIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const profitBeforeTax = incomeStatement?.profitBeforeTax ?? null;
  const operatingIncome = incomeStatement?.operatingIncome ?? null;
  const nonOperatingIncome = profitBeforeTax !== null && operatingIncome !== null ? profitBeforeTax - operatingIncome : null;

  const value = nonOperatingIncome !== null && profitBeforeTax !== null ? toPercent(nonOperatingIncome, profitBeforeTax) : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '本季稅前淨利',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'incomeStatement',
      fieldKey: 'profit_loss_before_tax',
      sourceDescription: null,
      value: toProvenanceEntryValue(profitBeforeTax),
    },
    {
      role: '本季營業利益',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'incomeStatement',
      fieldKey: 'profit_loss_from_operating_activities',
      sourceDescription: null,
      value: toProvenanceEntryValue(operatingIncome),
    },
  ];

  return {
    symbol,
    metricCode: 'nonOperatingIncomeRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: '業外損益不是財報原始欄位，是稅前淨利 - 營業利益相減得出的中繼值，見上方原始欄位。',
  };
};
