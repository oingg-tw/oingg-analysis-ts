import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toRatio4FromNumbers as toRatio4 } from '@/domainPitMetrics/shared/numericHelpers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/infrastructure/repositories/mops/balanceSheetXbrlFirst';
import { getMarketCapAsOf } from '@/infrastructure/repositories/twse/marketCap';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——tobinsQ = (市值 + 總負債) / 總資產（簡化版 Tobin's
// Q，市場對負債的評價假設等於帳面值）。市值用本季知識時點，資產負債表欄位換算成元後
// 相加。跟 computeTobinsQPit.ts 一致。只有 Q 一種 basis。

export const getTobinsQProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'tobinsQ', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCapAsOf = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const marketCap = marketCapAsOf?.marketCap ?? null;

  const value = marketCap !== null && totalLiabilities !== null && totalAssets !== null ? toRatio4(marketCap + Number(totalLiabilities) * 1000, Number(totalAssets) * 1000) : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '市值（本季知識時點：收盤價 × 流通股數）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCapAsOf ? `收盤價 ${marketCapAsOf.closePrice}（${marketCapAsOf.tradeDate}）× 流通股數 ${marketCapAsOf.paidInShares.toString()}` : null,
      value: toProvenanceEntryValue(marketCap),
    },
    { role: '本季期末總負債', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'liabilities', sourceDescription: null, value: toProvenanceEntryValue(totalLiabilities) },
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
  ];

  return { symbol, metricCode: 'tobinsQ', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
