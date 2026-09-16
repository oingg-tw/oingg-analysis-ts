import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——priceToOcf(TTM) = 市值(本季知識時點，不是企業價值)
// / 近四季營業活動現金流加總。跟 computeCashFlowValuationFamilyPit.ts 一致——這支用市值
// 不是 EV（跟 evToOcf 不同），這裡只重新查這支自己真正的依賴。只有 TTM 一種 basis。

export const getPriceToOcfProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'priceToOcf', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const [balanceSheet, mainIncomeStatement, mainCashFlowStatement] = await Promise.all([
    deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
    deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
    deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
  ]);
  const reportDate = balanceSheet?.reportDate ?? mainIncomeStatement?.reportDate ?? mainCashFlowStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const ocfs = ttmRecords.map((r) => r?.netCashFromOperatingActivities ?? null);

  let ocfTtmSum = 0n;
  let complete = true;
  for (const ocf of ocfs) {
    if (ocf === null) complete = false;
    else ocfTtmSum += ocf;
  }

  const value = complete && marketCap !== null ? (Number(ocfTtmSum) * 1000 === 0 ? null : Math.round((marketCap.marketCap / (Number(ocfTtmSum) * 1000)) * 100) / 100) : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '市值（本季知識時點：收盤價 × 流通股數）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCap ? `收盤價 ${marketCap.closePrice}（${marketCap.tradeDate}）× 流通股數 ${marketCap.paidInShares.toString()}` : null,
      value: toProvenanceEntryValue(marketCap?.marketCap ?? null),
    },
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `TTM 營業活動現金流（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(ocfs[i]),
      })
    ),
  ];

  return { symbol, metricCode: 'priceToOcf', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
