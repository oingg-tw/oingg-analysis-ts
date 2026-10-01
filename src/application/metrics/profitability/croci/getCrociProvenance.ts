import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry } from '../../shared/provenance/averageBalanceEntries';
import { resolveCrociData, type CrociDeps } from './computeCroci';

// 2026-09-13 使用者要求擴大稽核鏈——croci(TTM) = 近四季毛現金流（淨利+財務費用+折舊+攤銷）
// 加總 / 經濟資本（總資產-流動負債）。是簡化版 CROCI（不做通膨/資本化調整）。固定回傳 TTM。
// 2026-10-01 改用 computeCroci 的 resolveCrociData()（同一份資料與計算）：分母 2026-09-22 起是 5 個季末經濟資本的平均
// （興櫃半年頻 3 點），這裡原本自己算本季期末值，溯源值跟儲存值對不上。

export const getCrociProvenance = async (query: QuarterlyMetricQuery, deps: CrociDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveCrociData(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'croci', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, seasonNum, balances, economicCapitalAvgTtm, basis, ttmQuarters, ttmRecords, ttmNetIncomes: netIncomes, ttmValue } = resolution;
  const financeCosts = ttmRecords.map(([incomeRecord]) => incomeRecord?.financeCosts ?? null);
  const depreciations = ttmRecords.map(([, cashFlowRecord]) => cashFlowRecord?.depreciation ?? null);
  const amortizations = ttmRecords.map(([, cashFlowRecord]) => cashFlowRecord?.amortization ?? null);

  const entries: ProvenanceEntry[] = [
    ...averageBalanceEntries(balances, [
      { label: '總資產', fieldKey: 'assets', pick: (bs) => bs.totalAssets },
      { label: '流動負債', fieldKey: 'current_liabilities', pick: (bs) => bs.currentLiabilities },
    ]),
    averagedDenominatorEntry('平均經濟資本（總資產-流動負債）', balances, economicCapitalAvgTtm),
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `近一年 淨利（${trailingPeriodLabel(tq, basis)}，用於毛現金流）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: netIncomes[i]!.fieldKey,
          sourceDescription: null,
          value: toProvenanceEntryValue(netIncomes[i]!.value),
        },
        {
          role: `近一年 財務費用（${trailingPeriodLabel(tq, basis)}，用於毛現金流）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
        {
          role: `近一年 折舊（${trailingPeriodLabel(tq, basis)}，用於毛現金流）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'adj_depreciation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(depreciations[i]),
        },
        {
          role: `近一年 攤銷（${trailingPeriodLabel(tq, basis)}，用於毛現金流）`,
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
    metricCode: 'croci',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: ttmValue,
    entries,
    methodologyNote:
      '分子毛現金流 = 淨利+財務費用+折舊+攤銷（TTM 加總，見上方原始欄位）。分母經濟資本 = 總資產-流動負債，取近四季窗口 5 個季末的平均（興櫃半年頻 3 點，見上方逐點列出）。這是簡化版 CROCI，不做原始方法論的通膨/資本化調整。',
  };
};
