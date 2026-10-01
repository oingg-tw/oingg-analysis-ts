import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingCashFlowStatements, trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——priceToOcf(TTM) = 市值(本季知識時點，不是企業價值)
// / 近四季營業活動現金流加總。跟 computeCashFlowValuationFamilyPit.ts 一致——這支用市值
// 不是 EV（跟 evToOcf 不同），這裡只重新查這支自己真正的依賴。只有 TTM 一種 basis。

export const getPriceToOcfProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
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

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  // compute 是損益表／現金流兩份 trailing 逐段配對，兩者的期間由同一個「看損益表長相」的判斷決定，所以只取現金流這份期間也相同。
  const trailing = await resolveTrailingCashFlowStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
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
      sourceDescription: marketCap ? `收盤價 ${marketCap.closePrice}（${marketCap.tradeDate}）× 流通股數 ${marketCap.outstandingCommonShares.toString()}` : null,
      value: toProvenanceEntryValue(marketCap?.marketCap ?? null),
    },
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近一年 營業活動現金流（${trailingPeriodLabel(tq, trailing.basis)}）`,
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
