import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveRoaData, type RoaDeps } from './computeRoa';

// 2026-09-13 使用者要求擴大稽核鏈——ROA(TTM) = 近四季淨利加總 / 總資產。固定回傳 TTM。
// 2026-10-01 改用 computeRoa 的 resolveRoaData()（同一份資料與計算）：2026-09-22 分母改成近四季窗口 5 個季末總資產平均
// （興櫃半年頻 3 點）後，這裡原本自己算的「本季期末總資產」讓溯源值跟儲存值對不上，逐點列出平均分母。

export const getRoaProvenance = async (query: QuarterlyMetricQuery, deps: RoaDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveRoaData(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'roa', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, seasonNum, balances, basis, ttmQuarters, ttmNetIncomes, roaTtmPct } = resolution;

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近一年 淨利（${trailingPeriodLabel(tq, basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: ttmNetIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmNetIncomes[i]!.value),
      })
    ),
    ...averageBalanceEntries(balances, [{ label: '總資產', fieldKey: 'assets', pick: (bs) => bs.totalAssets }]),
    averagedDenominatorEntry('平均總資產', balances, balances.assetsAvgTtm),
  ];

  return {
    symbol,
    metricCode: 'roa',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: roaTtmPct,
    entries,
    methodologyNote: 'ROA（TTM）= 近一年淨利加總 ÷ 近四季窗口 5 個季末總資產的平均（t−4 … t；興櫃半年頻為 t−4、t−2、t 三點）。2026-09-22 前分母是本季單一期末值。',
  };
};
