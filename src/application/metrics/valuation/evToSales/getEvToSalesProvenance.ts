import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——evToSales(TTM) = 企業價值(EV=市值+淨負債，本季知識
// 時點) / 近四季營收加總。跟 computeCashFlowValuationFamilyPit.ts 一致，這裡只重新查
// 這支自己真正的依賴。只有 TTM 一種 basis。

export const getEvToSalesProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'evToSales', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
  const shortTermBorrowings = balanceSheet?.shortTermBorrowings ?? null;
  const bondsPayable = balanceSheet?.bondsPayable ?? null;
  const longTermBorrowings = balanceSheet?.longTermBorrowings ?? null;
  const totalDebt = balanceSheet ? (shortTermBorrowings ?? 0n) + (bondsPayable ?? 0n) + (longTermBorrowings ?? 0n) : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const netDebt = totalDebt !== null && cashAndEquivalents !== null ? totalDebt - cashAndEquivalents : null;
  const reportDate = balanceSheet?.reportDate ?? mainIncomeStatement?.reportDate ?? mainCashFlowStatement?.reportDate ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;
  const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap.marketCap + Number(netDebt) * 1000 : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const revenues = ttmRecords.map((r) => r?.operatingRevenue ?? null);

  let revenueTtmSum = 0n;
  let complete = true;
  for (const revenue of revenues) {
    if (revenue === null) complete = false;
    else revenueTtmSum += revenue;
  }

  const value = complete && enterpriseValue !== null ? (Number(revenueTtmSum) * 1000 === 0 ? null : Math.round((enterpriseValue / (Number(revenueTtmSum) * 1000)) * 100) / 100) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末有息負債—短期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'shortterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(shortTermBorrowings) },
    { role: '本季期末有息負債—應付公司債（非流動部分）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'noncurrent_portion_of_bonds_issued', sourceDescription: null, value: toProvenanceEntryValue(bondsPayable) },
    { role: '本季期末有息負債—長期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'longterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(longTermBorrowings) },
    { role: '本季期末現金及約當現金', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'cash_and_cash_equivalents', sourceDescription: null, value: toProvenanceEntryValue(cashAndEquivalents) },
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
        role: `TTM 營收（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(revenues[i]),
      })
    ),
  ];

  return {
    symbol,
    metricCode: 'evToSales',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `EV(企業價值) = 市值 + 淨負債(有息負債-現金及約當現金)，EV＝${enterpriseValue ?? 'null'}。`,
  };
};
