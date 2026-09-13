import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveAccrualsRatioInputs } from './computeAccrualsRatioPit';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-11 web-nuxt 要求（第二批試點，見 pilot 擴大範圍的說明）：GET /companies/:symbol/
// metric-provenance 的 accrualsRatio 試點，現查現算不持久化。TTM basis（badge 用的 timeframe）
// 需要 4 季 × (淨利 + OCF + ICF) = 12 筆 + 1 筆本季期末總資產（分母，不隨 TTM 加總）= 13 筆，
// 每一筆都是真實可對照的原始欄位（不是統計估計值），不像 sue 需要截斷，全部列出。ICF
// （netCashFromInvestingActivities）原本誤判成沒有對應的單一 XBRL 欄位、標記成
// type:'other' 反推值——mops-ts 2026-09-11 澄清 `net_cash_flows_from_used_in_investing_activities`
// 本來就是原生申報欄位，`getCashFlowStatementXbrlFirst` 已改成優先採原生值，這裡對應改回
// statementField，只有極少數原生欄位仍缺漏、退回會計恆等式反推的情況才標記 type:'other'。


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
      value: toProvenanceEntryValue(detail.netIncome.value),
    };
    const ocfEntry: ProvenanceEntry = {
      role: `${label}營業活動現金流`,
      fiscalYear: detail.fiscalYear,
      fiscalQuarter: detail.season,
      type: 'statementField',
      statementType: 'cashFlowStatement',
      fieldKey: 'cash_flows_from_used_in_operating_activities',
      sourceDescription: null,
      value: toProvenanceEntryValue(detail.cashFlow?.netCashFromOperatingActivities ?? null),
    };
    const icfEntry: ProvenanceEntry = {
      role: `${label}投資活動現金流`,
      fiscalYear: detail.fiscalYear,
      fiscalQuarter: detail.season,
      type: 'statementField',
      statementType: 'cashFlowStatement',
      fieldKey: 'net_cash_flows_from_used_in_investing_activities',
      sourceDescription: null,
      value: toProvenanceEntryValue(detail.cashFlow?.netCashFromInvestingActivities ?? null),
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
    value: toProvenanceEntryValue(totalAssets),
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
