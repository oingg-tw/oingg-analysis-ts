import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { pickEquityWithFieldKey as pickEquity } from '@/domainPitMetrics/shared/pickers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/balanceSheetXbrlFirst';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——deRatio(負債權益比) 分子刻意不是總負債，是「有息負債」
// = 短期借款+應付公司債+長期借款（見 computeDeRatioPit.ts），跟 debtRatio 用總負債不同，
// 不要看名字誤以為公式一樣。權益優先採歸屬母公司口徑，缺漏退回整體口徑。純資產負債表
// 時點快照，只有 Q 一種 basis。三個借款科目任一缺漏視為 0（不是整體 missing_input），
// 跟原始 compute 檔案的 `?? 0n` 行為一致。

export const getDeRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'deRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
  const value = totalDebt !== null && equity.value !== null ? toPercent(totalDebt, equity.value) : null;

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
    metricCode: 'deRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `分子有息負債 = 短期借款 + 應付公司債 + 長期借款（三者任一缺漏視為 0，見上方三筆原始欄位相加），本身不是財報原始欄位，也不是總負債。有息負債＝${totalDebt ?? 'null'}。`,
  };
};
