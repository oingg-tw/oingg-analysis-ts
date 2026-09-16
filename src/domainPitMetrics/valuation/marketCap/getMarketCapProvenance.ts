import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/mops/balanceSheetXbrlFirst';
import { getMarketCapAsOf } from '@/models/twse/marketCap';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { roundToSignificantFigures } from '@/domainPitMetrics/shared/numericHelpers';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——marketCap = 收盤價 × 流通股數（該季知識時點，比照
// stockPrice 只用資產負債表解析），四捨五入到 4 位有效數字。跟 computeMarketCapPit.ts
// 一致，不是財報衍生值，是純市場觀察值。只有 Q 一種 basis。

export const getMarketCapProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'marketCap', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = balanceSheet?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const marketCapAsOf = mainAnchor ? await getMarketCapAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const value = marketCapAsOf ? roundToSignificantFigures(marketCapAsOf.marketCap, 4) : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '收盤價（該季知識時點）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCapAsOf ? `證交所／櫃買中心每日收盤價（實際交易日 ${marketCapAsOf.tradeDate}）` : null,
      value: toProvenanceEntryValue(marketCapAsOf?.closePrice ?? null),
    },
    {
      role: '流通股數（該季知識時點）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報',
      value: toProvenanceEntryValue(marketCapAsOf?.paidInShares ?? null),
    },
  ];

  return {
    symbol,
    metricCode: 'marketCap',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `市值 = 收盤價 × 流通股數，四捨五入到 4 位有效數字。原始未四捨五入值＝${marketCapAsOf?.marketCap ?? 'null'}。`,
  };
};
