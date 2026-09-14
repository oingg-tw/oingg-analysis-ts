import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPerShare } from '@/domainPitMetrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/models/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/models/capitalStock';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——EPS(TTM) = 近四季淨利加總×1000 / 流通股數。流通股數
// 固定用「本季報告日」當下有效的股本（跟 computeEpsPit.ts 一致，Q/TTM 共用同一個股數），
// 是「非財報欄位」（type='other'，公開發行公司股本變動申報）。固定回傳 TTM。

export const getEpsProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'eps', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const currentIncomeStatement = await getQuarterlyIncomeStatement(key);
  const reportDate = currentIncomeStatement?.reportDate ?? null;
  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const netIncomes = ttmRecords.map(pickNetIncome);

  let netIncomeTtmSum = 0n;
  let complete = true;
  for (const picked of netIncomes) {
    if (picked.value === null) complete = false;
    else netIncomeTtmSum += picked.value;
  }

  const value = complete && sharesValue !== null ? toPerShare(netIncomeTtmSum, sharesValue) : null;

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `TTM 淨利（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: netIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]!.value),
      })
    ),
    { role: '流通股數（本季報告日當下有效）', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(sharesValue) },
  ];

  return { symbol, metricCode: 'eps', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
