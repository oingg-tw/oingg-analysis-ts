import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { averageBalanceEntries, averagedDenominatorEntry, investedCapitalComponents } from '../../shared/provenance/averageBalanceEntries';
import { resolveNissimPenmanRnoaData, type NissimPenmanRnoaDeps } from './computeNissimPenmanRnoa';

// 2026-09-13 使用者要求擴大稽核鏈——nissimPenmanRnoa(TTM) = 近四季 NOPAT 加總 / NOA。NOPAT = 營業利益 × (1-有效稅率)，
// 有效稅率 = 所得稅費用/稅前淨利。NOA = 權益 + NFO，NFO(淨財務負債) = 有息負債 - 現金及約當現金。只遷移 RNOA 本身，
// 不遷移 FLEV/NBC/SPREAD 這些模型內部機制。固定回傳 TTM。
// 2026-10-01 改用 computeNissimPenmanRnoa 的 resolveNissimPenmanRnoaData()（同一份資料與計算）：NOA 2026-09-22 起是
// 5 個季末的平均（興櫃半年頻 3 點），這裡原本自己算本季期末值，溯源值跟儲存值對不上；逐點列出每一季末的組成欄位。

export const getNissimPenmanRnoaProvenance = async (query: QuarterlyMetricQuery, deps: NissimPenmanRnoaDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveNissimPenmanRnoaData(query, deps);
  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'nissimPenmanRnoa', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, seasonNum, balances, noaAvgTtm, basis, ttmQuarters, ttmRecords, rnoaTtmPct } = resolution;
  const operatingIncomes = ttmRecords.map((record) => record?.operatingIncome ?? null);
  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const incomeTaxExpenses = ttmRecords.map((record) => record?.incomeTaxExpense ?? null);

  const entries: ProvenanceEntry[] = [
    ...averageBalanceEntries(balances, investedCapitalComponents),
    averagedDenominatorEntry('平均 NOA（權益+有息負債-現金）', balances, noaAvgTtm),
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `近一年 營業利益（${trailingPeriodLabel(tq, basis)}，用於 NOPAT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_from_operating_activities',
          sourceDescription: null,
          value: toProvenanceEntryValue(operatingIncomes[i]),
        },
        {
          role: `近一年 稅前淨利（${trailingPeriodLabel(tq, basis)}，用於 NOPAT 有效稅率）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(preTaxes[i]),
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
    metricCode: 'nissimPenmanRnoa',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: rnoaTtmPct,
    entries,
    methodologyNote:
      'NOPAT（各季）= 營業利益 × (1-有效稅率)，有效稅率=所得稅費用/稅前淨利（夾在 0~1）；稅前淨利非正（虧損）時該季稅率當 0。NOA(淨營運資產) = 權益 + NFO(淨財務負債)，NFO = 有息負債-現金及約當現金；NOA 取近四季窗口 5 個季末的平均（興櫃半年頻 3 點，見上方逐點列出）。',
  };
};
