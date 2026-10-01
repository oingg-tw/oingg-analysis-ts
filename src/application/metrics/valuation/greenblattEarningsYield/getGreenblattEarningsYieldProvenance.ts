import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { Season } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { additionalDebtEntries } from '@/application/metrics/shared/provenance/debtEntries';
import { resolveGreenblattEarningsYieldInputs, type GreenblattEarningsYieldDeps } from './computeGreenblattEarningsYield';

// 2026-10-01 使用者要求「溯源表請務必都加上」——2026-09-14 那次「先不曝露、等神奇公式上線再合併回來」的條件
// 已經成立（2026-09-15 神奇公式上線，見 metricDefinitionRegistry.ts），這裡補上。
// greenblattEarningsYield(TTM) = 近一年 EBIT(稅前淨利+財務成本) ÷ EV × 100。值直接讀 compute 的
// resolveGreenblattEarningsYieldInputs（同一份輸入、同一個捨入），不在這裡重算；條目形狀跟 getEvToEbitProvenance.ts 一致
// （EV 的組成逐項列，EBIT 逐期列兩個欄位）。只有 TTM 一種 basis。

export const getGreenblattEarningsYieldProvenance = async (query: QuarterlyMetricQuery, deps: GreenblattEarningsYieldDeps): Promise<MetricProvenanceResult> => {
  const r = await resolveGreenblattEarningsYieldInputs(query, deps);
  if (!r) {
    return { symbol: query.symbol, metricCode: 'greenblattEarningsYield', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { fiscalYear, fiscalQuarter, balanceSheet: bs, marketCapAsOf, totalDebt, cashAndEquivalents } = r;
  const bsEntry = (role: string, fieldKey: string, value: bigint | null): ProvenanceEntry => ({
    role, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'balanceSheet', fieldKey, sourceDescription: null, value: toProvenanceEntryValue(value),
  });
  const enterpriseValue = r.marketCap !== null && totalDebt !== null && cashAndEquivalents !== null ? r.marketCap + Number(totalDebt) * 1000 - Number(cashAndEquivalents) * 1000 : null;

  const entries: ProvenanceEntry[] = [
    bsEntry('本季期末有息負債—短期借款', 'shortterm_borrowings', bs?.shortTermBorrowings ?? null),
    bsEntry('本季期末有息負債—應付公司債（非流動部分）', 'noncurrent_portion_of_bonds_issued', bs?.bondsPayable ?? null),
    bsEntry('本季期末有息負債—長期借款', 'longterm_borrowings', bs?.longTermBorrowings ?? null),
    ...additionalDebtEntries(bs, fiscalYear, fiscalQuarter),
    bsEntry('本季期末現金及約當現金', 'cash_and_cash_equivalents', cashAndEquivalents),
    {
      role: '市值（本季知識時點：收盤價 × 流通股數）',
      fiscalYear,
      fiscalQuarter,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCapAsOf ? `收盤價 ${marketCapAsOf.closePrice}（${marketCapAsOf.tradeDate}）× 流通股數 ${marketCapAsOf.outstandingCommonShares.toString()}` : null,
      value: toProvenanceEntryValue(r.marketCap),
    },
    ...r.ttmQuarterDetails.flatMap((d): ProvenanceEntry[] => {
      const label = trailingPeriodLabel({ year: String(d.rocYear), season: String(d.season) as Season }, r.basis);
      const base = { fiscalYear: d.fiscalYear, fiscalQuarter: d.season, type: 'statementField' as const, statementType: 'incomeStatement' as const, sourceDescription: null };
      return [
        { ...base, role: `近一年 稅前淨利（${label}，用於 EBIT）`, fieldKey: 'profit_loss_before_tax', value: toProvenanceEntryValue(d.profitBeforeTax) },
        { ...base, role: `近一年 財務成本（${label}，用於 EBIT）`, fieldKey: 'finance_costs', value: toProvenanceEntryValue(d.financeCosts) },
      ];
    }),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'greenblattEarningsYield',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: r.earningsYieldTtm,
    entries,
    methodologyNote:
      `EV(企業價值) = 市值 + 有息負債 − 現金及約當現金，EV＝${enterpriseValue ?? 'null'}。EBIT(TTM) = 每一期稅前淨利+財務成本加總，不是財報原始欄位，見上方原始欄位。` +
      (r.basis === 'semiannual' ? '興櫃公司採半年頻：上半年取第二季累計數，下半年為全年累計 − 上半年累計。' : ''),
  };
};
