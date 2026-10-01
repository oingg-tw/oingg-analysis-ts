import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry, investedCapitalComponents } from '../../shared/provenance/averageBalanceEntries';
import { resolveRoicData, type RoicDeps } from './computeRoic';

// 2026-09-13 使用者要求擴大稽核鏈——roic(TTM) = 近四季 NOPAT 加總 / 投入資本（有息負債+權益-現金）。
// NOPAT = (稅前淨利+財務費用) × (1-有效稅率)，有效稅率 = 所得稅費用/稅前淨利（夾在 0~1），稅前淨利 ≤ 0 時稅率當 0
// （2026-09-28 起）。固定回傳 TTM。NOPAT 是計算出的中繼值不是原始欄位，用 methodologyNote 說明換算，
// 三個組成欄位（稅前淨利/財務費用/所得稅費用）都列成 entries。
// 2026-10-01 改用 computeRoic 的 resolveRoicData()（同一份資料與計算）：投入資本 2026-09-22 起是 5 個季末的平均
// （興櫃半年頻 3 點），這裡原本自己算本季期末值，溯源值跟儲存值對不上；逐點列出每一季末的組成欄位。

export const getRoicProvenance = async (query: QuarterlyMetricQuery, deps: RoicDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveRoicData(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'roic', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, seasonNum, balances, investedCapitalAvgTtm, basis, ttmQuarters, ttmRecords, ttmValue } = resolution;
  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map((record) => record?.financeCosts ?? null);
  const incomeTaxExpenses = ttmRecords.map((record) => record?.incomeTaxExpense ?? null);

  const entries: ProvenanceEntry[] = [
    ...averageBalanceEntries(balances, investedCapitalComponents),
    averagedDenominatorEntry('平均投入資本（有息負債+權益-現金）', balances, investedCapitalAvgTtm),
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `近一年 稅前淨利（${trailingPeriodLabel(tq, basis)}，用於 NOPAT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(preTaxes[i]),
        },
        {
          role: `近一年 財務費用（${trailingPeriodLabel(tq, basis)}，用於 NOPAT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
        {
          role: `近一年 所得稅費用（${trailingPeriodLabel(tq, basis)}，用於 NOPAT 有效稅率）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'income_tax_expense_continuing_operations',
          sourceDescription: null,
          value: toProvenanceEntryValue(incomeTaxExpenses[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'roic',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: ttmValue,
    entries,
    methodologyNote:
      'NOPAT（各季）= (稅前淨利+財務費用) × (1-有效稅率)，有效稅率=所得稅費用/稅前淨利（夾在 0~1）；稅前淨利非正（虧損）時該季稅率當 0、NOPAT=EBIT。投入資本 = 有息負債+權益-現金及約當現金，取近四季窗口 5 個季末的平均（興櫃半年頻 3 點，見上方逐點列出）。',
  };
};
