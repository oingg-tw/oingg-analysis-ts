import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/models/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——consecutiveDividendYears = 從最近一個完整會計年度
// 往回數，逐年檢查「該年 4 季現金流量表發放股利加總是否非零」，遇到 0 或缺資料就停止，
// 回傳連續年數。用「這個會計年度有沒有實際付出股利現金」判斷，不是股利政策本身（沒有
// 專門的股利分派公告資料源）。跟 computeConsecutiveDividendYearsPit.ts 一致，最多回溯
// 30 年。entries 只列每一年的股利發放加總（1 筆/年），跟 consecutiveProfitYears 同一個
// 省略慣例（見該檔案的說明）。

const MAX_LOOKBACK_YEARS = 30;

export const getConsecutiveDividendYearsProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'consecutiveDividendYears', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;

  let consecutiveYears = 0;
  let cursorRocYear = latestCompleteFiscalYear;
  let firstYearDataAvailable = false;
  const entries: ProvenanceEntry[] = [];

  for (let i = 0; i < MAX_LOOKBACK_YEARS; i++) {
    const yearQuarters = getPastNQuarters({ rocYear: cursorRocYear, season: '4' }, 4);
    const records = await Promise.all(
      yearQuarters.map((q) => getQuarterlyCashFlowStatement({ symbol, year: Number(q.year), quarter: Number(q.season), dataType, subsidiaryCompanyId }))
    );

    if (records.some((r) => r === null)) break;
    firstYearDataAvailable = true;

    const yearDividendsPaid = records.reduce((sum, r) => sum + (r?.dividendsPaid ?? 0n), 0n);

    entries.push({
      role: `民國 ${cursorRocYear} 年度發放股利加總（第 ${consecutiveYears + 1} 個連續配息年度候選，原始資料是現金流出負值）`,
      fiscalYear: rocYearToGregorian(cursorRocYear),
      fiscalQuarter: 4,
      type: 'statementField',
      statementType: 'cashFlowStatement',
      fieldKey: null,
      sourceDescription: null,
      value: toProvenanceEntryValue(yearDividendsPaid),
    });

    if (yearDividendsPaid === 0n) break;

    consecutiveYears += 1;
    cursorRocYear -= 1;
  }

  const value = firstYearDataAvailable ? consecutiveYears : null;

  return {
    symbol,
    metricCode: 'consecutiveDividendYears',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `從最近一個完整會計年度（民國 ${latestCompleteFiscalYear} 年）往回逐年檢查該年 4 季現金流量表發放股利加總是否非零，遇到 0 或任一季資料缺漏即停止計數，最多回溯 ${MAX_LOOKBACK_YEARS} 年。上方最後一筆 entry 若加總為 0，代表該年度是判定連續中斷的年度，不計入 value。`,
  };
};
