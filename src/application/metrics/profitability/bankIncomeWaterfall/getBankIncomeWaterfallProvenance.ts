import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { BankIncomeStatementFields } from '@/application/ports/financialStatements';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveBankIncomeWaterfallData } from './computeBankIncomeWaterfall';

// 2026-10-01 使用者要求溯源表全部補齊：銀行業損益瀑布圖四支每股指標。跟 compute 共用 resolveBankIncomeWaterfallData
// （季度解析、股數、近四季完整度、殘差法），value 直接取它算好的 TTM 結果，保證跟 metric_values 一致。
// 固定回傳 TTM（跟其餘每股試點 revenuePerShare／depreciationAmortisationPerShare 一致）。銀行一定是上市櫃季報，
// 期間標籤用 quarters。來源是銀行業損益表明細，不屬於一般三大表的 statementType，entry 用 type other（不改共用 schema）。
type BankIncomeWaterfallCode = 'bankNetInterestIncomePerShare' | 'bankNetNonInterestIncomePerShare' | 'bankBadDebtProvisionPerShare' | 'bankOtherOperatingExpensePerShare';
type Field = { label: string; pick: (r: BankIncomeStatementFields) => bigint | null };

const NET_INTEREST: Field = { label: '利息淨收益', pick: (r) => r.netInterestIncome };
const NET_NON_INTEREST: Field = { label: '利息以外淨收益', pick: (r) => r.netNonInterestIncome };
const BAD_DEBT: Field = { label: '呆帳費用、承諾及保證責任準備提存', pick: (r) => r.badDebtProvision };
const PRETAX: Field = { label: '稅前淨利', pick: (r) => r.profitBeforeTax };

const FIELDS: Record<BankIncomeWaterfallCode, Field[]> = {
  bankNetInterestIncomePerShare: [NET_INTEREST],
  bankNetNonInterestIncomePerShare: [NET_NON_INTEREST],
  bankBadDebtProvisionPerShare: [BAD_DEBT],
  bankOtherOperatingExpensePerShare: [NET_INTEREST, NET_NON_INTEREST, BAD_DEBT, PRETAX],
};

const COMMON_NOTE = '近四季單季金額加總（千元）× 1000 ÷ 本季報告日流通在外普通股數。瀑布圖四個項目共用同一個完整度判斷：近四季任一季、四個原始科目任一缺值，四支的近四季值都不計算。';
const OTHER_OPEX_NOTE = '其他營業費用沒有單一申報科目，用殘差法推出：利息淨收益 + 利息以外淨收益 − 呆帳費用 − 稅前淨利，確保瀑布圖每一步都加總得起來。';

export const getBankIncomeWaterfallProvenance = (metricCode: BankIncomeWaterfallCode, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'industry'>) =>
  async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const resolved = await resolveBankIncomeWaterfallData(query, deps);
    if (!resolved) {
      return { symbol: query.symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }
    const { fiscalYear, seasonNum, sharesValue, ttmQuarters, ttmRecords, ttm } = resolved;

    const entries: ProvenanceEntry[] = [
      { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(sharesValue) },
      ...ttmQuarters.flatMap((tq, i) =>
        FIELDS[metricCode].map(
          (f): ProvenanceEntry => ({
            role: `近四季 ${f.label}（${trailingPeriodLabel(tq, 'quarters')}）`,
            fiscalYear: rocYearToGregorian(Number(tq.year)),
            fiscalQuarter: Number(tq.season),
            type: 'other',
            statementType: null,
            fieldKey: null,
            sourceDescription: '銀行業損益表明細（XBRL 申報）',
            value: toProvenanceEntryValue(ttmRecords[i] ? f.pick(ttmRecords[i]) : null),
          })
        )
      ),
    ];

    return {
      symbol: query.symbol,
      metricCode,
      found: true,
      fiscalYear,
      fiscalQuarter: seasonNum,
      value: ttm[metricCode].value,
      entries,
      methodologyNote: metricCode === 'bankOtherOperatingExpensePerShare' ? `${COMMON_NOTE}${OTHER_OPEX_NOTE}` : COMMON_NOTE,
    };
  };
