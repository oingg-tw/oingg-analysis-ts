import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveRuleOf40Inputs, type RuleOf40Deps } from './computeRuleOf40';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-10-01 使用者要求溯源表全部補齊：ruleOf40(TTM) = 近一年營收成長率 + 近一年 FCF 利潤率。跟 computeRuleOf40
// 共用 resolveRuleOf40Inputs，數字必然一致。非軟體雲端業回 found: false——寫入路徑對它們本來就不寫任何列
// （不是 altmanZScore 那種「排除是寫入政策、溯源照算」的情況：那邊排除的公司仍有 not_applicable 列可對照，這裡沒有）。
// 列的順序：本期近一年（營收／營業現金流／資本支出逐期），再列去年同期近一年營收（成長率的分母）。

export const getRuleOf40Provenance = async (query: QuarterlyMetricQuery, deps: RuleOf40Deps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveRuleOf40Inputs(query, deps);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'ruleOf40', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, seasonNum, currentIncome, currentCashFlow, priorIncome, revenueGrowthTtmPct, fcfMarginTtmPct, ttmValue } = resolution;

  const currentEntries = currentIncome.periods.flatMap((p, i): ProvenanceEntry[] => {
    const label = `本期近一年 ${trailingPeriodLabel(p, currentIncome.basis)}`;
    const cashFlow = currentCashFlow.periods[i]?.record ?? null;
    const at = { fiscalYear: rocYearToGregorian(Number(p.year)), fiscalQuarter: Number(p.season), sourceDescription: null };
    return [
      { role: `${label}：營業收入`, ...at, type: 'statementField', statementType: 'incomeStatement', fieldKey: 'revenue', value: toProvenanceEntryValue(p.record?.operatingRevenue) },
      { role: `${label}：營業活動現金流（FCF 用）`, ...at, type: 'statementField', statementType: 'cashFlowStatement', fieldKey: 'cash_flows_from_used_in_operating_activities', value: toProvenanceEntryValue(cashFlow?.netCashFromOperatingActivities) },
      { role: `${label}：資本支出（FCF 用，原始資料是負值）`, ...at, type: 'statementField', statementType: 'cashFlowStatement', fieldKey: 'purchase_of_ppe_investing', value: toProvenanceEntryValue(cashFlow?.capitalExpenditures) },
    ];
  });

  const priorEntries = priorIncome.periods.map(
    (p): ProvenanceEntry => ({
      role: `去年同期近一年 ${trailingPeriodLabel(p, priorIncome.basis)}：營業收入（成長率分母）`,
      fiscalYear: rocYearToGregorian(Number(p.year)),
      fiscalQuarter: Number(p.season),
      type: 'statementField',
      statementType: 'incomeStatement',
      fieldKey: 'revenue',
      sourceDescription: null,
      value: toProvenanceEntryValue(p.record?.operatingRevenue),
    })
  );

  return {
    symbol,
    metricCode: 'ruleOf40',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: ttmValue,
    entries: [...currentEntries, ...priorEntries],
    methodologyNote:
      `Rule of 40 = 近一年營收成長率（本期近一年營收 ÷ 去年同期近一年營收 − 1）+ 近一年 FCF 利潤率（FCF ÷ 本期近一年營收），兩者都是百分比、直接相加。` +
      `FCF = 營業活動現金流 + 資本支出（資本支出帶負號，相加即為扣除）。本次中繼值：營收成長率 ${revenueGrowthTtmPct ?? 'null'}%、FCF 利潤率 ${fcfMarginTtmPct ?? 'null'}%。` +
      `只計算資訊服務業／數位雲端類公司；興櫃公司的近一年是兩個半年期間。`,
  };
};
