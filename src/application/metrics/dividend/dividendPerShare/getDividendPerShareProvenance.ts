import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateDividendPerShare, dividendWindowStart, isInDividendWindow } from '@/domain/metrics/dividend/dividendPerShare/calculateDividendPerShare';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { dividendPerShareWindowEnd, listRestatedDividendRows, type DividendPerShareDeps } from './computeDividendPerShare';

// 2026-10-01 補溯源表（使用者：「溯源表請務必都加上」）。dividendPerShare 寫在季表（TTM，座標＝季末），所以照季報型用
// year/season 定位（不給就最新一季），asOfDate 不適用。季別解析、窗口終點、面額還原、加總都呼叫 computeDividendPerShare
// 同一批函式；entries 逐筆列出窗口內的除息（每筆金額＝盈餘配發＋法定盈餘公積與資本公積發放，已面額還原），加總就是 value。
const SOURCE = '公開資訊觀測站股利分派情形（普通股，元／股）';
const day = (d: Date): string => d.toISOString().slice(0, 10);

export const getDividendPerShareProvenance = async (query: QuarterlyMetricQuery, deps: Pick<DividendPerShareDeps, 'quarters' | 'dividendEvents' | 'shares'>): Promise<MetricProvenanceResult> => {
  const { symbol } = query;
  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);
  if (!resolvedQuarter) return { symbol, metricCode: 'dividendPerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };

  const seasonNum = Number(resolvedQuarter.season);
  const fiscalYear = rocYearToGregorian(Number(resolvedQuarter.year));
  const windowEnd = dividendPerShareWindowEnd(fiscalYear, seasonNum);
  const rows = await listRestatedDividendRows(symbol, windowEnd, deps);
  const calc = calculateDividendPerShare(rows, windowEnd);

  const entries: ProvenanceEntry[] = rows
    .filter((r) => isInDividendWindow(r.exDividendDate, windowEnd))
    .map((r): ProvenanceEntry => {
      const period = r.fiscalQuarter === null ? `民國 ${r.rocFiscalYear} 年度` : `民國 ${r.rocFiscalYear} 年第 ${r.fiscalQuarter} 季`;
      const split = r.splitFactor === 1 ? '' : `，已除以面額變更倍數 ${r.splitFactor} 換算到 ${day(windowEnd)} 股數基準`;
      return {
        role: `除息 ${day(r.exDividendDate!)}（${period}盈餘分派）每股現金股利：盈餘配發 ${r.cashDividendFromEarnings ?? 0} 元＋法定盈餘公積與資本公積發放 ${r.cashDividendFromLegalReserveAndCapitalSurplus ?? 0} 元${split}`,
        fiscalYear: rocYearToGregorian(r.rocFiscalYear),
        fiscalQuarter: r.fiscalQuarter,
        type: 'other',
        statementType: null,
        fieldKey: null,
        sourceDescription: SOURCE,
        value: (r.cashDividendFromEarnings ?? 0) + (r.cashDividendFromLegalReserveAndCapitalSurplus ?? 0),
      };
    });

  const nullNote = calc.nullReason === 'insufficient_history' ? '窗口起點早於股利公告資料的全市場起點（2019-09-30），不拿殘缺資料加總。' : calc.nullReason === 'missing_input' ? '這家公司在股利公告資料裡一筆都沒有，分不出沒配過還是上游沒收到，不當成 0。' : '';
  return {
    symbol,
    metricCode: 'dividendPerShare',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: calc.value,
    entries,
    methodologyNote:
      `近一年每股現金股利＝除息日落在 ${day(dividendWindowStart(windowEnd))}（不含）到 ${day(windowEnd)}（含）的普通股每股現金股利公告值加總，四捨五入到小數 2 位；` +
      `窗口內沒有除息為 0。跨過股票分割、配股或股數合併式減資的除息，每股金額換算到窗口結束時的股數基準。${nullNote}`,
  };
};
