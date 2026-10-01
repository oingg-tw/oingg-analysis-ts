import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { toProvenanceEntryValue, type ProvenanceEntry } from '@/application/metrics/shared/provenance/provenanceTypes';
import { commonShareEntries } from '@/application/metrics/shared/provenance/shareEntries';
import type { resolveCashFlowPerShareInputs } from './computeCashFlowPerShare';

// 2026-10-01 每股現金流家族三支溯源表（ocfPerShare／fcfPerShare／depreciationAmortisationPerShare）共用 resolveCashFlowPerShareInputs
// 之後，原始欄位列也從同一份 resolution 產生；各支只挑自己公式用到的欄位，角色文字沿用改版前各檔的寫法。
type Resolution = NonNullable<Awaited<ReturnType<typeof resolveCashFlowPerShareInputs>>>;
type Field = 'ocf' | 'capex' | 'depreciation' | 'amortization';

const FIELDS: Record<Field, { role: string; fieldKey: string; pick: (r: Resolution['ttmRecords'][number]) => bigint | null | undefined }> = {
  ocf: { role: '營業活動現金流', fieldKey: 'cash_flows_from_used_in_operating_activities', pick: (r) => r?.netCashFromOperatingActivities },
  capex: { role: '資本支出（原始資料是負值）', fieldKey: 'purchase_of_ppe_investing', pick: (r) => r?.capitalExpenditures },
  depreciation: { role: '折舊費用', fieldKey: 'adj_depreciation_expense', pick: (r) => r?.depreciation },
  amortization: { role: '攤銷費用', fieldKey: 'adj_amortisation_expense', pick: (r) => r?.amortization },
};

export const cashFlowPerShareEntries = (r: Resolution, fields: Field[]): ProvenanceEntry[] => [
  ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum),
  ...r.ttmQuarters.flatMap((tq, i): ProvenanceEntry[] =>
    fields.map((f) => ({
      role: `近一年 ${FIELDS[f].role}（${trailingPeriodLabel(tq, r.trailing.basis)}）`,
      fiscalYear: rocYearToGregorian(Number(tq.year)),
      fiscalQuarter: Number(tq.season),
      type: 'statementField',
      statementType: 'cashFlowStatement',
      fieldKey: FIELDS[f].fieldKey,
      sourceDescription: null,
      value: toProvenanceEntryValue(FIELDS[f].pick(r.ttmRecords[i] ?? null)),
    }))
  ),
];

// 寫入路徑的完整度條件是三支共用的：近一年每一期的營業現金流、資本支出、折舊、攤銷都要有，任一缺就三支同時 insufficient_history。
export const cashFlowPerShareGateNote = (r: Resolution): string | null =>
  r.ttmComplete ? null : '近一年任一期的營業現金流、資本支出、折舊、攤銷有缺漏（同批三支每股現金流指標共用這個完整度條件），因此不計算（insufficient_history）。';
