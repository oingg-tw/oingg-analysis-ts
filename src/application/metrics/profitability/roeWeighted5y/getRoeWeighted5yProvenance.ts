import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { calculateAnnualRoe } from '../roe/computeRoe';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { calculateRoeWeighted5y } from '@/domain/metrics/profitability/roeWeighted5y/calculateRoeWeighted5y';
import { resolveRoeWeighted5yInputs, type RoeWeighted5yDeps } from './computeRoeWeighted5y';

// 跟 computeRoeWeighted5y 共用 resolveRoeWeighted5yInputs，值一定等於寫入的值（2026-10-01「溯源表請務必都加上」）。
// 淨利、權益是合併總額優先（跟 roe 的 FY 一致），所以 fieldKey 照實際取到的那一欄標，不用 pickers（那組是母公司優先）。
const netIncomeField = (a: { netIncome: bigint | null; netIncomeAttributableToParent: bigint | null } | null) =>
  a?.netIncome != null ? { value: a.netIncome, fieldKey: 'profit_loss' } : { value: a?.netIncomeAttributableToParent ?? null, fieldKey: a?.netIncomeAttributableToParent != null ? 'profit_loss_attributable_to_owners_of_parent' : null };
const equityField = (b: { totalEquity: bigint | null; equityAttributableToParent: bigint | null } | null) =>
  b?.totalEquity != null ? { value: b.totalEquity, fieldKey: 'equity' } : { value: b?.equityAttributableToParent ?? null, fieldKey: b?.equityAttributableToParent != null ? 'equity_attributable_to_owners_of_parent' : null };

export const getRoeWeighted5yProvenance = async (query: QuarterlyMetricQuery, deps: RoeWeighted5yDeps): Promise<MetricProvenanceResult> => {
  const inputs = await resolveRoeWeighted5yInputs(query, deps);
  if (!inputs) {
    return { symbol: query.symbol, metricCode: 'roeWeighted5y', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }
  const { context, rocYears, annuals, yearEndBalanceSheets, netIncomes, yearEndEquities } = inputs;

  const entries: ProvenanceEntry[] = [
    ...rocYears.map((rocYear, i): ProvenanceEntry => {
      const f = netIncomeField(annuals[i] ?? null);
      return { role: `${rocYearToGregorian(rocYear)} 年全年稅後淨利（年報）`, fiscalYear: rocYearToGregorian(rocYear), fiscalQuarter: 4, type: 'statementField', statementType: 'incomeStatement', fieldKey: f.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(f.value) };
    }),
    ...[rocYears[0]! - 1, ...rocYears].map((rocYear, i): ProvenanceEntry => {
      const f = equityField(yearEndBalanceSheets[i] ?? null);
      return { role: `${rocYearToGregorian(rocYear)} 年底權益`, fiscalYear: rocYearToGregorian(rocYear), fiscalQuarter: 4, type: 'statementField', statementType: 'balanceSheet', fieldKey: f.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(f.value) };
    }),
  ];

  const yearlyRoe = rocYears.map((rocYear, i) => `${rocYearToGregorian(rocYear)} 年 ${calculateAnnualRoe(netIncomes[i] ?? null, yearEndEquities[i] ?? null, yearEndEquities[i + 1] ?? null).value ?? 'null'}%`).join('、');
  const { value } = calculateRoeWeighted5y(netIncomes, yearEndEquities);
  return {
    symbol: query.symbol,
    metricCode: 'roeWeighted5y',
    found: true,
    fiscalYear: context.fiscalYear,
    fiscalQuarter: 4,
    value,
    entries,
    methodologyNote:
      `五年全年稅後淨利合計 ÷ 五個年度平均權益合計 × 100，每年平均權益 =（去年底 + 今年底）÷ 2。等同五個年度 ROE 以各年平均權益加權平均；` +
      `各年度 ROE：${yearlyRoe}（跟股東權益報酬率的年度值同一套算法）。`,
  };
};
