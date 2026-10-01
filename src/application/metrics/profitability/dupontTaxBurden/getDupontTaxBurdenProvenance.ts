import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { resolveDupontFamilyData, type DupontFamilyDeps } from '../../shared/dupont/computeDupontFamily';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求：GET /companies/:symbol/metric-provenance 擴大到 dupontTaxBurden，固定回傳 TTM。
// 2026-10-01 改走 compute 同一份 resolveDupontFamilyData：原本自己重算，完整度只看淨利與稅前淨利，但 compute 的五因子
// 用 extendedTtmComplete（還要財務費用齊），金控沒有財務費用 → 存 insufficient_history、溯源卻有值（6 家金控對不上）。
// 值直接取 compute 的 dupontTaxBurdenTtmCalc，entries 多列財務費用，讓「為什麼不齊」看得到。
export const getDupontTaxBurdenProvenance = async (query: QuarterlyMetricQuery, deps: DupontFamilyDeps): Promise<MetricProvenanceResult> => {
  const data = await resolveDupontFamilyData(query, deps);
  if (!data) {
    return { symbol: query.symbol, metricCode: 'dupontTaxBurden', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const entries: ProvenanceEntry[] = data.ttmQuarters.flatMap((tq, i) => {
    const record = data.ttmRecords[i] ?? null;
    const label = trailingPeriodLabel(tq, data.basis);
    const fiscalYear = rocYearToGregorian(Number(tq.year));
    const fiscalQuarter = Number(tq.season);
    const netIncome = pickNetIncome(record);
    const field = (role: string, fieldKey: string | null, value: bigint | null): ProvenanceEntry => ({
      role: `近一年 ${role}（${label}）`,
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'incomeStatement',
      fieldKey,
      sourceDescription: null,
      value: toProvenanceEntryValue(value),
    });
    return [
      field('淨利', netIncome.fieldKey, netIncome.value),
      field('稅前淨利', 'profit_loss_before_tax', record?.profitBeforeTax ?? null),
      field('財務費用（五因子完整度需要）', 'finance_costs', record?.financeCosts ?? null),
    ];
  });

  return {
    symbol: query.symbol,
    metricCode: 'dupontTaxBurden',
    found: true,
    fiscalYear: data.fiscalYear,
    fiscalQuarter: data.seasonNum,
    value: data.dupontTaxBurdenTtmCalc.value,
    entries,
    methodologyNote: '近一年淨利 / 近一年稅前淨利。五因子杜邦的近一年要求每一期淨利、稅前淨利、財務費用都有值，任一期缺（例如金控沒有財務費用科目）就不計算。',
  };
};
