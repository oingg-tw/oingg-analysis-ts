import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateAssetTurnover } from '@/domain/metrics/efficiency/assetTurnover/calculateAssetTurnover';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-21 web-nuxt 要求（杜邦頁「計算依據表」）：assetTurnover 的稽核鏈。固定回傳 TTM（跟 roe/
// dupontTaxBurden 同一個試點慣例，也是杜邦年化恆等式 netProfitMargin.TTM × assetTurnover.TTM ×
// equityMultiplier.Q = roe.TTM 用的那個 basis）：近四季營收加總 / 本季期末總資產，跟
// computeDupontFamily.ts 的 assetTurnoverTtm 同一支 calculateAssetTurnover 純函式，分母刻意不平均、
// 不加總四季總資產（見該檔說明）。
export const getAssetTurnoverProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);
  if (!resolvedQuarter) {
    return { symbol, metricCode: 'assetTurnover', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const [balanceSheet, ...incomeStatements] = await Promise.all([
    deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
    ...ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId })),
  ]);
  const revenues = incomeStatements.map((r) => r?.operatingRevenue ?? null);
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const ttmComplete = revenues.every((v) => v !== null);
  const value = ttmComplete && totalAssets !== null ? calculateAssetTurnover(revenues.reduce((sum, v) => sum + v!, 0n), totalAssets).value : null;

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近四季 營業收入（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(revenues[i]),
      })
    ),
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
  ];

  return {
    symbol,
    metricCode: 'assetTurnover',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: 'TTM 口徑：近四季營業收入加總 / 本季期末總資產（分母不平均、不加總四季），四捨五入到小數 4 位。',
  };
};
