import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getStockPriceAsOf } from '@/shared/sourceData/marketCap';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——stockPrice = 該季知識時點（比照 bvps，只用資產負債表
// 解析）當下最近一筆收盤價。跟 computeStockPricePit.ts 一致，不是財報衍生值，是純市場
// 觀察值。只有 Q 一種 basis。

export const getStockPriceProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'stockPrice', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = balanceSheet?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const stockPrice = mainAnchor ? await getStockPriceAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const value = stockPrice?.closePrice ?? null;

  const entries: ProvenanceEntry[] = [
    {
      role: '該季知識時點對應的收盤價',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: stockPrice ? `證交所／櫃買中心每日收盤價（實際交易日 ${stockPrice.tradeDate}，取知識時點當下或之前最近一筆）` : null,
      value: toProvenanceEntryValue(value),
    },
  ];

  return { symbol, metricCode: 'stockPrice', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
