import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/models/mops/cashFlowStatementXbrlFirst';
import { absBigint } from '@/domainPitMetrics/shared/numericHelpers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——abnormalCapexRatio（Titman, Wei & Xie 2004）=
// 最近完整會計年度資本支出(取絕對值) / 前三年資本支出(取絕對值)平均 - 1，再乘 100。
// 跟 computeAbnormalCapexRatioPit.ts 一致，只有一個回溯窗口。entries 列最近完整年度 +
// 前三年，各自 4 季資本支出加總（1 筆/年，跟 consecutiveProfitYears 同一個省略慣例）。

interface AnnualCapexResult {
  capex: bigint | null;
  quarterlySum: bigint | null;
}

const getAnnualCapex = async (
  cache: Map<number, AnnualCapexResult>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<AnnualCapexResult> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => getQuarterlyCashFlowStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const hasAll = quarters.every((q) => q !== null && q.capitalExpenditures !== null);
  const quarterlySum = hasAll ? quarters.reduce((sum, q) => sum! + q!.capitalExpenditures!, 0n) : null;
  const result: AnnualCapexResult = { capex: quarterlySum !== null ? absBigint(quarterlySum) : null, quarterlySum };
  cache.set(rocYear, result);
  return result;
};

export const getAbnormalCapexRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'abnormalCapexRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const cache = new Map<number, AnnualCapexResult>();

  const current = await getAnnualCapex(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId);
  const priorYears = [1, 2, 3].map((yearsAgo) => latestCompleteFiscalYear - yearsAgo);
  const priors = await Promise.all(priorYears.map((y) => getAnnualCapex(cache, symbol, y, dataType, subsidiaryCompanyId)));

  let value: number | null = null;
  if (current.capex !== null && !priors.some((p) => p.capex === null)) {
    const priorAverage = priors.reduce((sum, p) => sum + p.capex!, 0n) / 3n;
    if (priorAverage !== 0n) {
      value = Math.round((Number(current.capex) / (Number(priors.reduce((sum, p) => sum + p.capex!, 0n)) / 3) - 1) * 100 * 100) / 100;
    }
  }

  const entries: ProvenanceEntry[] = [
    { role: `最近完整會計年度（民國 ${latestCompleteFiscalYear} 年）資本支出加總（取絕對值，原始資料是負值）`, fiscalYear: rocYearToGregorian(latestCompleteFiscalYear), fiscalQuarter: 4, type: 'statementField', statementType: 'cashFlowStatement', fieldKey: null, sourceDescription: null, value: toProvenanceEntryValue(current.capex) },
    ...priors.map(
      (p, i): ProvenanceEntry => ({
        role: `${i + 1} 年前（民國 ${priorYears[i]} 年）資本支出加總（取絕對值，原始資料是負值）`,
        fiscalYear: rocYearToGregorian(priorYears[i]!),
        fiscalQuarter: 4,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: null,
        sourceDescription: null,
        value: toProvenanceEntryValue(p.capex),
      })
    ),
  ];

  return {
    symbol,
    metricCode: 'abnormalCapexRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `每筆 entry 是該年度 4 季資本支出加總後取絕對值的結果，不逐季展開（原始資料是投資活動現金流出負值）。abnormalCapexRatio = 最近完整年度資本支出 / 前三年資本支出平均 - 1，再乘 100。`,
  };
};
