import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 長期負債 = 長期借款 + 應付公司債（非流動部分），刻意不含短期借款（跟 deRatio 的「有息
// 負債」不同組合，見 computeLongTermDebtToNetCurrentAssetsPit.ts 的說明）。淨流動資產 =
// 流動資產 - 流動負債，<=0 時 value 是 null（zero_or_negative_denominator）。純資產負債表
// 時點快照，只有 Q 一種 basis。

export const getLongTermDebtToNetCurrentAssetsProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'longTermDebtToNetCurrentAssets', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const longTermBorrowings = balanceSheet?.longTermBorrowings ?? null;
  const bondsPayable = balanceSheet?.bondsPayable ?? null;
  const longTermDebt = balanceSheet ? (longTermBorrowings ?? 0n) + (bondsPayable ?? 0n) : null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const netCurrentAssets = currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null;
  const value = netCurrentAssets !== null && netCurrentAssets > 0n && longTermDebt !== null ? toPercent(longTermDebt, netCurrentAssets) : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '本季期末長期借款',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'longterm_borrowings',
      sourceDescription: null,
      value: toProvenanceEntryValue(longTermBorrowings),
    },
    {
      role: '本季期末應付公司債（非流動部分）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'noncurrent_portion_of_bonds_issued',
      sourceDescription: null,
      value: toProvenanceEntryValue(bondsPayable),
    },
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    { role: '本季期末流動負債', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_liabilities', sourceDescription: null, value: toProvenanceEntryValue(currentLiabilities) },
  ];

  return {
    symbol,
    metricCode: 'longTermDebtToNetCurrentAssets',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `分子長期負債 = 長期借款 + 應付公司債非流動部分（任一缺漏視為 0）＝${longTermDebt ?? 'null'}；分母淨流動資產 = 流動資產 - 流動負債＝${netCurrentAssets ?? 'null'}，<=0 時不計算比率。`,
  };
};
