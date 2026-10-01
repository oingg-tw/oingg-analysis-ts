import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { calculateDistributionsPerFiscalYear } from '@/domain/metrics/dividend/dividendDistributionCount/calculateDividendDistributionCount';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { DividendDistributionCountDeps } from './computeDividendDistributionCount';

// 2026-10-01 補溯源表（使用者：「溯源表請務必都加上」）。這支跟寫入一樣只看「目前全部的股利分派公告」，沒有歷史時點可選
// （computeDividendDistributionCount 也不讀 year/season，見該檔說明），year/season/asOfDate 都不適用。
// 座標（fiscalYear/fiscalQuarter＝最新一次除息日的日曆季度）跟寫入的那列一致；次數呼叫同一支 calculateDistributionsPerFiscalYear。
// entries 列出「最近兩個有分派紀錄的盈餘所屬年度」裡的每一次除息（同一天除息只算一次），value 是除息日。
const LOOKBACK_FISCAL_YEARS = 2; // 跟 calculateDistributionsPerFiscalYear 的「最近兩個盈餘年度」同一個數字

export const getDividendDistributionCountProvenance = async (query: { symbol: string }, deps: DividendDistributionCountDeps): Promise<MetricProvenanceResult> => {
  const { symbol } = query;
  const events = await deps.dividendEvents.getDividendDistributionEvents(symbol);
  if (events.length === 0) return { symbol, metricCode: 'dividendDistributionCount', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };

  const latest = events[0]!; // 依除息日由新到舊
  const value = calculateDistributionsPerFiscalYear(events);

  const counted = [...new Set(events.map((e) => e.rocFiscalYear).filter((y): y is number => y !== null))].sort((a, b) => b - a).slice(0, LOOKBACK_FISCAL_YEARS);
  const seen = new Set<string>();
  const entries: ProvenanceEntry[] = [];
  for (const e of events) {
    if (e.rocFiscalYear === null || !counted.includes(e.rocFiscalYear)) continue;
    const exDate = e.exDividendDate.toISOString().slice(0, 10);
    const key = `${e.rocFiscalYear}:${exDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      role: `民國 ${e.rocFiscalYear} 年度盈餘的一次分派（除息日）`,
      fiscalYear: rocYearToGregorian(e.rocFiscalYear),
      fiscalQuarter: null,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: `公開資訊觀測站股利分派情形${e.announcementDate ? `（公告日 ${e.announcementDate.toISOString().slice(0, 10)}）` : ''}`,
      value: exDate,
    });
  }

  const perYear = counted.map((y) => `民國 ${y} 年度 ${entries.filter((x) => x.fiscalYear === rocYearToGregorian(y)).length} 次`).join('、');
  return {
    symbol,
    metricCode: 'dividendDistributionCount',
    found: true,
    fiscalYear: latest.exDividendDate.getUTCFullYear(),
    fiscalQuarter: Math.floor(latest.exDividendDate.getUTCMonth() / 3) + 1,
    value,
    entries,
    methodologyNote:
      `配息次數＝最近兩個有分派紀錄的盈餘所屬年度裡，單一年度分派幾次取較大者（同一天除息只算一次）：年配 1、半年配 2、季配 4。` +
      `取兩年的較大值是因為最新那個盈餘年度常常還沒配完。盈餘所屬年度缺值的公告不計。${perYear ? `本次：${perYear}。` : ''}`,
  };
};
