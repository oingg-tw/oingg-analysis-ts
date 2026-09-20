import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveAltmanZScoreInputs, type AltmanZScoreDeps } from './computeAltmanZScore';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-11 web-nuxt 要求（第二批試點）：GET /companies/:symbol/metric-provenance 的
// altmanZScore 試點，現查現算不持久化。這是三支裡工作量最大的一支——X1/X2 用本季資產負債表
// 三個科目、X3/X5 各自需要近四季（含本季）損益表加總、X4 需要市值（衍生自 marketCap
// metricCode 同一套邏輯，不是單一原始科目，用 type:'other' 標示）。totalAssets 同時是
// X1/X2/X3/X5 的分母，只列一次（role 講清楚它被用在哪幾個係數），不重複四次。


export const getAltmanZScoreProvenance = async (query: QuarterlyMetricQuery, deps: AltmanZScoreDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveAltmanZScoreInputs(query, deps);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'altmanZScore', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, totalAssets, totalLiabilities, currentAssets, currentLiabilities, retainedEarnings, marketCap, ttmQuarterDetails, zScore } = resolution;

  const entries: ProvenanceEntry[] = [
    {
      role: '流動資產（X1 分子）',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'current_assets',
      sourceDescription: null,
      value: toProvenanceEntryValue(currentAssets),
    },
    {
      role: '流動負債（X1 分子）',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'current_liabilities',
      sourceDescription: null,
      value: toProvenanceEntryValue(currentLiabilities),
    },
    {
      role: '保留盈餘（X2 分子）',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'retained_earnings',
      sourceDescription: null,
      value: toProvenanceEntryValue(retainedEarnings),
    },
    {
      role: '總資產（X1/X2/X3/X5 共用分母）',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'assets',
      sourceDescription: null,
      value: toProvenanceEntryValue(totalAssets),
    },
    {
      role: '總負債（X4 分母）',
      fiscalYear,
      fiscalQuarter,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'liabilities',
      sourceDescription: null,
      value: toProvenanceEntryValue(totalLiabilities),
    },
    {
      role: '市值（X4 分子，= 流通股數 × 股價，見 marketCap 指標）',
      fiscalYear,
      fiscalQuarter,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: marketCap ? `市值快照，股價交易日 ${marketCap.tradeDate}` : null,
      value: marketCap ? marketCap.marketCap : null,
    },
    ...ttmQuarterDetails.flatMap((detail, i): ProvenanceEntry[] => {
      const label = `近四季 第 ${i + 1}/4 季（X3/X5 分子加總項）`;
      return [
        {
          role: `${label}：稅前淨利`,
          fiscalYear: detail.fiscalYear,
          fiscalQuarter: detail.season,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(detail.profitBeforeTax),
        },
        {
          role: `${label}：財務成本（利息費用）`,
          fiscalYear: detail.fiscalYear,
          fiscalQuarter: detail.season,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(detail.financeCosts),
        },
        {
          role: `${label}：營業收入`,
          fiscalYear: detail.fiscalYear,
          fiscalQuarter: detail.season,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'revenue',
          sourceDescription: null,
          value: toProvenanceEntryValue(detail.operatingRevenue),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'altmanZScore',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: zScore,
    entries,
    methodologyNote:
      'X3（EBIT/總資產）= (稅前淨利+財務成本) 近四季加總 / 本季期末總資產；X5（營收/總資產）= 營業收入近四季加總 / 本季期末總資產，兩者分母固定用本季單一期末總資產，不是四季平均。Z = 1.2×X1 + 1.4×X2 + 3.3×X3 + 0.6×X4 + 0.999×X5。',
  };
};
