import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { commonShareEntries } from '../../shared/provenance/shareEntries';
import { resolveEpsInputs, type EpsDeps } from './computeEps';

// 2026-09-13 使用者要求擴大稽核鏈——EPS(TTM) = (近四季淨利加總 − 近四季特別股股利)×1000 / 流通在外普通股。流通股數
// 固定用「本季報告日」當下有效的股本（Q/TTM 共用同一個股數），是「非財報欄位」（type='other'）。固定回傳 TTM。
//
// 2026-10-01 改成跟 computeEps 共用 resolveEpsInputs：原本這裡自己重算，沒跟上 2026-09-25 的 IAS 33 分子扣特別股股利
// （2881 溯源 11.92 vs 寫入 11.64）。值直接取 resolution.epsTtm；股數列拆成流通在外普通股的組成與特別股股利。

export const getEpsProvenance = async (query: QuarterlyMetricQuery, deps: Pick<EpsDeps, 'statements' | 'quarters' | 'shares' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const r = await resolveEpsInputs(query, deps);

  if (!r) {
    return { symbol: query.symbol, metricCode: 'eps', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const entries: ProvenanceEntry[] = [
    ...r.ttmQuarters.map((tq, i): ProvenanceEntry => {
      const netIncome = pickNetIncome(r.ttmRecords[i] ?? null);
      return {
        role: `近一年 淨利（${trailingPeriodLabel(tq, r.trailing.basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: netIncome.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncome.value),
      };
    }),
    ...commonShareEntries(r.shares, r.fiscalYear, r.seasonNum, { preferredDividends: 'TTM' }),
  ];

  return {
    symbol: r.symbol,
    metricCode: 'eps',
    found: true,
    fiscalYear: r.fiscalYear,
    fiscalQuarter: r.seasonNum,
    value: r.epsTtm,
    entries,
    methodologyNote: 'EPS(TTM) = (近一年淨利加總 − 近四季特別股股利) × 1000（千元換元）÷ 流通在外普通股（IAS 33：分子分母都只算普通股）。',
  };
};
