import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { pickEquityWithFieldKey } from '@/domain/metrics/shared/pickers';
import { trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toProvenanceEntryValue, type ProvenanceEntry } from '@/application/metrics/shared/provenance/provenanceTypes';
import { additionalDebtEntries } from '@/application/metrics/shared/provenance/debtEntries';
import type { CashFlowValuationResolution } from './computeCashFlowValuationFamily';

// 2026-10-01 現金流估值家族八支溯源表（croic／capexToOcfRatio／debtToFcf／fcfConversionRate／evToOcf／evToSales／priceToOcf／
// ocfMargin）共用 resolveCashFlowValuationInputs 之後，原始欄位列也從同一份 resolution 產生——各支只挑自己公式用到的部分，
// 角色文字沿用改版前各檔的寫法。值本身（resolution.values）跟寫入路徑同一份，這裡只負責「列出算式用了哪些數字」。
type Part = 'debt' | 'cash' | 'equity' | 'marketCap' | 'revenue' | 'netIncome' | 'ocf' | 'capex';

const balanceEntry = (r: CashFlowValuationResolution, role: string, fieldKey: string | null, value: bigint | null): ProvenanceEntry => ({
  role, fiscalYear: r.fiscalYear, fiscalQuarter: r.seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey, sourceDescription: null, value: toProvenanceEntryValue(value),
});

export const cashFlowValuationEntries = (r: CashFlowValuationResolution, parts: Part[]): ProvenanceEntry[] => {
  const has = (p: Part) => parts.includes(p);
  const bs = r.balanceSheet;
  const equity = pickEquityWithFieldKey(bs);
  const head: ProvenanceEntry[] = [
    ...(has('debt')
      ? [
          balanceEntry(r, '本季期末有息負債—短期借款', 'shortterm_borrowings', bs?.shortTermBorrowings ?? null),
          balanceEntry(r, '本季期末有息負債—應付公司債（非流動部分）', 'noncurrent_portion_of_bonds_issued', bs?.bondsPayable ?? null),
          balanceEntry(r, '本季期末有息負債—長期借款', 'longterm_borrowings', bs?.longTermBorrowings ?? null),
          ...additionalDebtEntries(bs, r.fiscalYear, r.seasonNum),
        ]
      : []),
    ...(has('equity') ? [balanceEntry(r, '本季期末權益', equity.fieldKey, equity.value)] : []),
    ...(has('cash') ? [balanceEntry(r, '本季期末現金及約當現金', 'cash_and_cash_equivalents', r.cashAndEquivalents)] : []),
    ...(has('marketCap')
      ? [
          {
            role: '市值（本季知識時點：收盤價 × 流通在外普通股）',
            fiscalYear: r.fiscalYear,
            fiscalQuarter: r.seasonNum,
            type: 'other' as const,
            statementType: null,
            fieldKey: null,
            sourceDescription: r.marketCap ? `收盤價 ${r.marketCap.closePrice}（${r.marketCap.tradeDate}）× 流通在外普通股 ${r.marketCap.outstandingCommonShares.toString()}` : null,
            value: toProvenanceEntryValue(r.marketCap?.marketCap ?? null),
          },
        ]
      : []),
  ];

  const trailing = r.ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
    const [income, cashFlow] = r.ttmRecords[i]!;
    const label = trailingPeriodLabel(tq, r.trailingIncome.basis);
    const at = { fiscalYear: rocYearToGregorian(Number(tq.year)), fiscalQuarter: Number(tq.season), sourceDescription: null };
    return [
      ...(has('revenue') ? [{ role: `近一年 營收（${label}）`, ...at, type: 'statementField' as const, statementType: 'incomeStatement' as const, fieldKey: 'revenue', value: toProvenanceEntryValue(income?.operatingRevenue) }] : []),
      ...(has('netIncome') ? [{ role: `近一年 淨利（${label}，整體口徑）`, ...at, type: 'statementField' as const, statementType: 'incomeStatement' as const, fieldKey: 'profit_loss', value: toProvenanceEntryValue(income?.netIncome) }] : []),
      ...(has('ocf')
        ? [{ role: `近一年 營業活動現金流（${label}）`, ...at, type: 'statementField' as const, statementType: 'cashFlowStatement' as const, fieldKey: 'cash_flows_from_used_in_operating_activities', value: toProvenanceEntryValue(cashFlow?.netCashFromOperatingActivities) }]
        : []),
      ...(has('capex')
        ? [{ role: `近一年 資本支出（${label}，投資活動現金流出，原始資料是負值）`, ...at, type: 'statementField' as const, statementType: 'cashFlowStatement' as const, fieldKey: 'purchase_of_ppe_investing', value: toProvenanceEntryValue(cashFlow?.capitalExpenditures) }]
        : []),
    ];
  });

  return [...head, ...trailing];
};

// 寫入路徑的完整度條件是家族共用的：近一年每一期的營收、淨利、營業現金流、資本支出四個都要有，任一缺就八支同時
// insufficient_history（例如金控沒有「營業收入」科目）。溯源表只列各支自己用到的欄位，所以不齊時用這句話說明為什麼是 null。
export const cashFlowValuationGateNote = (r: CashFlowValuationResolution): string =>
  r.ttmComplete ? '' : '近一年任一期的營收、淨利、營業現金流、資本支出有缺漏（同批八支現金流估值指標共用這個完整度條件），因此不計算（insufficient_history）。';
