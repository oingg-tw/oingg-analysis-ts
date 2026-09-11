import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveAccrualsRatioInputs } from './computeAccrualsRatioPit';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../provenance/provenanceTypes';

// 2026-09-11 web-nuxt 要求（第二批試點，見 pilot 擴大範圍的說明）：GET /companies/:symbol/
// metric-provenance 的 accrualsRatio 試點，現查現算不持久化。TTM basis（badge 用的 token）
// 需要 4 季 × (淨利 + OCF + ICF) = 12 筆 + 1 筆本季期末總資產（分母，不隨 TTM 加總）= 13 筆，
// 每一筆都是真實可對照的原始欄位（不是統計估計值），不像 sue 需要截斷，全部列出。ICF
// （netCashFromInvestingActivities）是會計恆等式反推出來的（現金淨增減－CFO－CFF－匯率
// 影響），沒有對應的單一 XBRL 欄位，標記成 type:'other'，不是 statementField。

const toEntryValue = (value: bigint | null): string | number | null => (value === null ? null : value.toString());

export const getAccrualsRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const resolution = await resolveAccrualsRatioInputs(query);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'accrualsRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, totalAssets, ttmQuarterDetails, ttmValue } = resolution;

  const entries: ProvenanceEntry[] = ttmQuarterDetails.flatMap((detail, i): ProvenanceEntry[] => {
    const label = `TTM 第 ${i + 1}/4 季`;
    const netIncomeEntry: ProvenanceEntry = {
      role: `${label}淨利（歸屬母公司）`,
      fiscalYear: detail.fiscalYear,
      fiscalQuarter: detail.season,
      type: 'statementField',
      statementType: 'incomeStatement',
      fieldKey: detail.netIncome.fieldKey,
      sourceDescription: null,
      value: toEntryValue(detail.netIncome.value),
    };
    const ocfEntry: ProvenanceEntry = {
      role: `${label}營業活動現金流`,
      fiscalYear: detail.fiscalYear,
      fiscalQuarter: detail.season,
      type: 'statementField',
      statementType: 'cashFlowStatement',
      fieldKey: 'cash_flows_from_used_in_operating_activities',
      sourceDescription: null,
      value: toEntryValue(detail.cashFlow?.netCashFromOperatingActivities ?? null),
    };
    const icfEntry: ProvenanceEntry = {
      role: `${label}投資活動現金流`,
      fiscalYear: detail.fiscalYear,
      fiscalQuarter: detail.season,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '會計恆等式反推（現金及約當現金淨增減－營業活動現金流－籌資活動現金流－匯率影響），沒有對應的單一 XBRL 揭露欄位',
      value: toEntryValue(detail.cashFlow?.netCashFromInvestingActivities ?? null),
    };
    return [netIncomeEntry, ocfEntry, icfEntry];
  });

  entries.push({
    role: '本季期末總資產（分母，不隨 TTM 加總）',
    fiscalYear,
    fiscalQuarter,
    type: 'statementField',
    statementType: 'balanceSheet',
    fieldKey: 'assets',
    sourceDescription: null,
    value: toEntryValue(totalAssets),
  });

  return {
    symbol,
    metricCode: 'accrualsRatio',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: ttmValue,
    entries,
    methodologyNote: null,
  };
};
