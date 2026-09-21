import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveSueInputs, type SueQuarterDetail, type SueDeps } from './computeSue';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-10 web-nuxt 要求：GET /companies/:symbol/metric-provenance 的 sue 試點，現查現算不持久化。
// 2026-09-21 公式改採顧廣平（2011）版（見 computeSue.ts）：μ、σ 是前 8 季盈餘變動值的統計估計，
// 不是可逐格核對的原始事實，所以 entries 仍只列「構成本季盈餘變動值」的 2 筆（本季/去年同季淨利），
// 不再有股數（新公式用淨利金額不用 EPS），8 季樣本本身用 methodologyNote 講清楚。

const netIncomeEntry = (detail: SueQuarterDetail, label: string): ProvenanceEntry => ({
  role: `${label}單季淨利（歸屬母公司）`,
  fiscalYear: detail.fiscalYear,
  fiscalQuarter: detail.season,
  type: 'statementField',
  statementType: 'incomeStatement',
  fieldKey: detail.netIncome.fieldKey,
  sourceDescription: null,
  value: toProvenanceEntryValue(detail.netIncome.value),
});

export const getSueProvenance = async (query: QuarterlyMetricQuery, deps: SueDeps): Promise<MetricProvenanceResult> => {
  const resolution = await resolveSueInputs(query, deps);

  if (!resolution) {
    return { symbol: query.symbol, metricCode: 'sue', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { symbol, fiscalYear, fiscalQuarter, quarterDetails, lastIndex, sueValue } = resolution;

  return {
    symbol,
    metricCode: 'sue',
    found: true,
    fiscalYear,
    fiscalQuarter,
    value: sueValue,
    entries: [netIncomeEntry(quarterDetails[lastIndex]!, '本季'), netIncomeEntry(quarterDetails[lastIndex - 4]!, '去年同季')],
    methodologyNote:
      '顧廣平（2011）定義：SUE =（本季淨利 − 去年同季淨利 − μ）/ σ，μ、σ 是前 8 季「單季淨利 − 去年同季淨利」的平均數與樣本標準差；這裡只列出構成本季變動值的 2 期原始欄位，8 季樣本本身不逐筆列出。',
  };
};
