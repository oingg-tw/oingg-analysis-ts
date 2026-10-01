import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { toProvenanceEntryValue, type ProvenanceEntry } from '@/application/metrics/shared/provenance/provenanceTypes';
import { commonShareEntries } from '@/application/metrics/shared/provenance/shareEntries';
import type { resolveLeverageDegreeInputs } from './computeLeverageDegreeFamily';

// 2026-10-01 DFL／DTL 兩支溯源表的原始欄位列（取代已刪除的 resolveLeverageDegreeProvenanceInputs.ts）：本季與去年同季各列淨利、
// 流通在外普通股組成、分母科目（DFL 是營業利益、DTL 是營收），最後列去年同季 EPS 的面額／配股還原倍數。
type Resolution = NonNullable<Awaited<ReturnType<typeof resolveLeverageDegreeInputs>>>;

export const leverageDegreeEntries = (r: Resolution, denominator: 'operatingIncome' | 'operatingRevenue'): ProvenanceEntry[] => {
  const priorFiscalYear = rocYearToGregorian(Number(r.prior.year));
  const priorSeason = Number(r.prior.season);
  const quarter = (label: string, fiscalYear: number, fiscalQuarter: number, statement: Resolution['currentIncomeStatement'], shares: Resolution['currentShares']): ProvenanceEntry[] => {
    const netIncome = pickNetIncome(statement);
    return [
      { role: `${label}淨利`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: netIncome.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(netIncome.value) },
      ...commonShareEntries(shares, fiscalYear, fiscalQuarter, { label: `${label}報告日` }),
      denominator === 'operatingIncome'
        ? { role: `${label}營業利益（EBIT）`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'profit_loss_from_operating_activities', sourceDescription: null, value: toProvenanceEntryValue(statement?.operatingIncome ?? null) }
        : { role: `${label}營收`, fiscalYear, fiscalQuarter, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'revenue', sourceDescription: null, value: toProvenanceEntryValue(statement?.operatingRevenue ?? null) },
    ];
  };
  return [
    ...quarter('本季', r.fiscalYear, r.seasonNum, r.currentIncomeStatement, r.currentShares),
    ...quarter('去年同季', priorFiscalYear, priorSeason, r.priorIncomeStatement, r.priorShares),
    {
      role: '去年同季到本季的面額／配股／減資還原倍數（去年同季 EPS ÷ 這個倍數，換算到本季股數基準）',
      fiscalYear: r.fiscalYear,
      fiscalQuarter: r.seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報（面額變更、股票股利、減資）',
      value: toProvenanceEntryValue(r.splitFactor),
    },
  ];
};
