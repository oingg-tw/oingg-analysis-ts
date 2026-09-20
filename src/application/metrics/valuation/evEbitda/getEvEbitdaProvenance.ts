import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——evEbitda(TTM) = 企業價值(EV=市值+淨負債，本季知識
// 時點) / 近四季 EBITDA(=稅前淨利+財務費用+折舊+攤銷)加總。跟 computeEvEbitdaPit.ts
// 一致。固定回傳 TTM（該指標只有 TTM 一種 basis，Q_ANN 已於 2026-09-14 移除）。

export const getEvEbitdaProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'evEbitda', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
    ttmQuarters.map((tq) =>
      Promise.all([
        deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );
  const preTaxes = ttmRecords.map(([r]) => r?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map(([r]) => r?.financeCosts ?? null);
  const depreciations = ttmRecords.map(([, r]) => r?.depreciation ?? null);
  const amortizations = ttmRecords.map(([, r]) => r?.amortization ?? null);

  let ebitdaTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (preTaxes[i] === null || financeCosts[i] === null || depreciations[i] === null || amortizations[i] === null) {
      complete = false;
    } else {
      ebitdaTtmSum += preTaxes[i]! + financeCosts[i]! + depreciations[i]! + amortizations[i]!;
    }
  }

  const value = complete && enterpriseValue !== null ? (Number(ebitdaTtmSum) * 1000 === 0 ? null : Math.round((enterpriseValue / (Number(ebitdaTtmSum) * 1000)) * 100) / 100) : null;

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
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `近四季 稅前淨利（第 ${i + 1}/4 季，用於 EBITDA）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(preTaxes[i]),
        },
        {
          role: `近四季 財務費用（第 ${i + 1}/4 季，用於 EBITDA）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
        {
          role: `近四季 折舊（第 ${i + 1}/4 季，用於 EBITDA）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'adj_depreciation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(depreciations[i]),
        },
        {
          role: `近四季 攤銷（第 ${i + 1}/4 季，用於 EBITDA）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'adj_amortisation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(amortizations[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'evEbitda',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `EV(企業價值) = 市值 + 淨負債(有息負債-現金及約當現金)，EV＝${enterpriseValue ?? 'null'}。EBITDA(TTM) = 稅前淨利+財務費用+折舊+攤銷加總，不是財報原始欄位，見上方原始欄位。`,
  };
};
