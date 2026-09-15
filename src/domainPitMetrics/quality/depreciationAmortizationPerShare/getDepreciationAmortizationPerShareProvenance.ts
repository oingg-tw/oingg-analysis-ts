import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/models/mops/cashFlowStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/models/mops/capitalStock';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { toPerShare } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——
// depreciationAmortizationPerShare(TTM) = 近四季（折舊費用+攤銷費用）加總×1000（千元換元）
// / 流通股數（本季報告日）。跟 computeCashFlowPerSharePit.ts / getOcfPerShareProvenance.ts
// 一致，股數用 reportDate 不是 knowledgeDate（不涉及股價，沒有 resolveKnowledgeDate 的
// 必要）。固定回傳 TTM（跟其餘試點慣例一致）。

export const getDepreciationAmortizationPerShareProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'depreciationAmortizationPerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const cashFlowStatement = await getQuarterlyCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = cashFlowStatement?.reportDate ?? null;
  const shares = reportDate ? (await getPaidInSharesAsOf(symbol, reportDate))?.paidInShares ?? null : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const depreciations = ttmRecords.map((r) => r?.depreciation ?? null);
  const amortizations = ttmRecords.map((r) => r?.amortization ?? null);

  let daSumTtm = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    const d = depreciations[i]!;
    const a = amortizations[i]!;
    if (d === null || a === null) complete = false;
    else daSumTtm += d + a;
  }

  const value = complete && shares !== null ? toPerShare(daSumTtm, shares) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(shares) },
    ...ttmQuarters.flatMap(
      (tq, i): ProvenanceEntry[] => [
        {
          role: `TTM 折舊費用（第 ${i + 1}/4 季）`,
          fiscalYear: rocYearToGregorian(Number(tq.year)),
          fiscalQuarter: Number(tq.season),
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'adj_depreciation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(depreciations[i] ?? null),
        },
        {
          role: `TTM 攤銷費用（第 ${i + 1}/4 季）`,
          fiscalYear: rocYearToGregorian(Number(tq.year)),
          fiscalQuarter: Number(tq.season),
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'adj_amortisation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(amortizations[i] ?? null),
        },
      ]
    ),
  ];

  return { symbol, metricCode: 'depreciationAmortizationPerShare', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
