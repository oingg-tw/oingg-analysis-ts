import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——totalDebtToCapital = 有息負債 / (有息負債+權益) × 100。
// 有息負債定義同 deRatio（短期借款+應付公司債+長期借款），權益 pick 邏輯同 deRatio（歸屬
// 母公司優先，缺漏退回整體口徑）。純資產負債表時點快照，只有 Q 一種 basis。

const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null; fieldKey: string | null } => {
  if (!record) return { value: null, fieldKey: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent, fieldKey: 'equity_attributable_to_owners_of_parent' };
  return { value: record.totalEquity, fieldKey: record.totalEquity !== null ? 'equity' : null };
};

export const getTotalDebtToCapitalProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'totalDebtToCapital', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const shortTermBorrowings = balanceSheet?.shortTermBorrowings ?? null;
  const bondsPayable = balanceSheet?.bondsPayable ?? null;
  const longTermBorrowings = balanceSheet?.longTermBorrowings ?? null;
  const totalDebt = balanceSheet ? (shortTermBorrowings ?? 0n) + (bondsPayable ?? 0n) + (longTermBorrowings ?? 0n) : null;
  const equity = pickEquity(balanceSheet);
  const denominator = totalDebt !== null && equity.value !== null ? totalDebt + equity.value : null;
  const value = totalDebt !== null && denominator !== null ? toPercent(totalDebt, denominator) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末短期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'shortterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(shortTermBorrowings) },
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
    { role: '本季期末權益', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
  ];

  return {
    symbol,
    metricCode: 'totalDebtToCapital',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `分子/分母組成的有息負債 = 短期借款 + 應付公司債 + 長期借款（見上方三筆原始欄位相加），分母再加上權益。有息負債＝${totalDebt ?? 'null'}。`,
  };
};
