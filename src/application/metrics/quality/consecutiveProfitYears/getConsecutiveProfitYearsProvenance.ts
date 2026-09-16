import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeValue as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——consecutiveProfitYears = 從最近一個完整會計年度往回
// 數，逐年檢查「該年 4 季淨利加總是否為正」，遇到非正或缺資料就停止，回傳連續年數。跟
// computeConsecutiveProfitYearsPit.ts 一致，最多回溯 30 年。entries 只列「構成連續年數」
// 的每一年加總淨利（1 筆/年），不逐季展開（逐季會是 4 倍筆數，但淨利加總本身已經是可
// 逐年核對的事實，不是統計估計值，所以不需要像 SUE 那樣進一步省略），用
// methodologyNote 說明判斷規則。

const MAX_LOOKBACK_YEARS = 30;

export const getConsecutiveProfitYearsProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'consecutiveProfitYears', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
      yearQuarters.map((q) => deps.statements.getIncomeStatement({ symbol, year: Number(q.year), quarter: Number(q.season), dataType, subsidiaryCompanyId }))
    );

    if (records.some((r) => r === null || pickNetIncome(r) === null)) break;
    firstYearDataAvailable = true;

    const yearNetIncome = records.reduce((sum, r) => sum + pickNetIncome(r)!, 0n);
    if (yearNetIncome <= 0n) break;

    entries.push({
      role: `民國 ${cursorRocYear} 年度淨利加總（歸屬母公司，第 ${consecutiveYears + 1} 個連續獲利年度）`,
      fiscalYear: rocYearToGregorian(cursorRocYear),
      fiscalQuarter: 4,
      type: 'statementField',
      statementType: 'incomeStatement',
      fieldKey: null,
      sourceDescription: null,
      value: toProvenanceEntryValue(yearNetIncome),
    });

    consecutiveYears += 1;
    cursorRocYear -= 1;
  }

  const value = firstYearDataAvailable ? consecutiveYears : null;

  return {
    symbol,
    metricCode: 'consecutiveProfitYears',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `從最近一個完整會計年度（民國 ${latestCompleteFiscalYear} 年）往回逐年檢查該年 4 季淨利（歸屬母公司，缺漏退回整體口徑）加總是否為正，遇到非正值或任一季資料缺漏即停止計數，最多回溯 ${MAX_LOOKBACK_YEARS} 年。上方每筆 entry 是該年度 4 季淨利加總後的結果，不逐季展開。`,
  };
};
