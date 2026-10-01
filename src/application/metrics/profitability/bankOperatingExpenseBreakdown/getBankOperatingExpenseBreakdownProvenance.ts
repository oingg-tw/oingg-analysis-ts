import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { BankOperatingExpenseFields } from '@/application/ports/financialStatements';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveBankOperatingExpenseBreakdownData } from './computeBankOperatingExpenseBreakdown';

// 2026-10-01 使用者要求溯源表全部補齊：銀行／金控營業費用三分拆每股。跟 compute 共用 resolveBankOperatingExpenseBreakdownData
// （「這季沒有其他業管就整批不寫」的擋門、股數、近四季完整度與加總），value 直接取它算好的 TTM 結果，保證跟 metric_values 一致。
// 固定回傳 TTM（跟其餘每股試點一致），期間標籤用 quarters（銀行／金控一定是季報）。來源不屬一般三大表，entry 用 type other。
type BankOperatingExpenseCode = 'bankEmployeeBenefitsExpensePerShare' | 'bankDepreciationAmortisationExpensePerShare' | 'bankGeneralAdministrativeExpensePerShare';

const FIELD: Record<BankOperatingExpenseCode, { label: string; source: string; pick: (r: BankOperatingExpenseFields) => bigint | null }> = {
  bankEmployeeBenefitsExpensePerShare: { label: '員工福利費用', source: '銀行業損益表明細（XBRL 申報）', pick: (r) => r.employeeBenefits },
  bankDepreciationAmortisationExpensePerShare: { label: '折舊及攤銷費用', source: '銀行業損益表明細（XBRL 申報）', pick: (r) => r.depreciationAmortisation },
  // 銀行讀銀行損益表明細、金控讀金控損益表明細（repository 內 coalesce），兩種格式都標出來。
  bankGeneralAdministrativeExpensePerShare: { label: '其他業務及管理費用', source: '銀行業／金控業損益表明細（XBRL 申報）', pick: (r) => r.otherGeneralAdministrative },
};

export const getBankOperatingExpenseBreakdownProvenance = (metricCode: BankOperatingExpenseCode, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'industry'>) =>
  async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const resolved = await resolveBankOperatingExpenseBreakdownData(query, deps);
    if (!resolved) {
      return { symbol: query.symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }
    const { fiscalYear, seasonNum, shares, ttmQuarters, ttmRecords, values } = resolved;
    const field = FIELD[metricCode];

    const entries: ProvenanceEntry[] = [
      { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(shares) },
      ...ttmQuarters.map(
        (tq, i): ProvenanceEntry => ({
          role: `近四季 ${field.label}（${trailingPeriodLabel(tq, 'quarters')}）`,
          fiscalYear: rocYearToGregorian(Number(tq.year)),
          fiscalQuarter: Number(tq.season),
          type: 'other',
          statementType: null,
          fieldKey: null,
          sourceDescription: field.source,
          value: toProvenanceEntryValue(ttmRecords[i] ? field.pick(ttmRecords[i]) : null),
        })
      ),
    ];

    return {
      symbol: query.symbol,
      metricCode,
      found: true,
      fiscalYear,
      fiscalQuarter: seasonNum,
      value: values[metricCode].ttm.value,
      entries,
      methodologyNote:
        '近四季單季金額加總（千元）× 1000 ÷ 本季報告日流通在外普通股數。營業費用 = 員工福利 + 折舊及攤銷 + 其他業務及管理費用，三支共用同一個完整度判斷：近四季任一季、三個科目任一缺值，三支的近四季值都不計算。',
    };
  };
