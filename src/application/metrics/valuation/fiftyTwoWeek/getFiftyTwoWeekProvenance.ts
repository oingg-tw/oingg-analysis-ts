import type { DailyClose } from '@/domain/metrics/valuation/fiftyTwoWeek/calculateFiftyTwoWeek';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import { resolveFiftyTwoWeek, type FiftyTwoWeekDeps } from './computeFiftyTwoWeek';

// 2026-10-07 溯源表（「溯源表請務必都加上」）。三支共用一支：同一支 resolveFiftyTwoWeek，值一定等於寫入的值。逐日型，用 asOfDate 定位
// （當天或之前最後一個有收盤價的交易日；不給就是最新）。列出公式實際用到的收盤價（還原後；有換算的同時寫原始收盤價）與股數基準事件，
// 一整年 ~245 筆收盤價不逐筆列（同 beta 的省略慣例）。
type FiftyTwoWeekCode = 'priceReturn52w' | 'distanceFrom52wHigh' | 'distanceFrom52wLow';

const SOURCE = '證交所／櫃買中心每日收盤價';
const day = (d: Date) => d.toISOString().slice(0, 10);

export const getFiftyTwoWeekProvenance = async (metricCode: FiftyTwoWeekCode, query: { symbol: string; asOfDate?: Date | undefined }, deps: FiftyTwoWeekDeps): Promise<MetricProvenanceResult> => {
  const { symbol } = query;
  const resolved = await resolveFiftyTwoWeek(symbol, query.asOfDate, deps);
  if (!resolved) return { symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  const { tradeDate, windowStart, rawCloses, closes, changes, result } = resolved;

  const rawByDate = new Map(rawCloses.map((c) => [c.tradeDate.getTime(), c.close]));
  const closeEntry = (role: string, c: DailyClose | undefined): ProvenanceEntry => {
    const raw = c ? rawByDate.get(c.tradeDate.getTime()) : undefined;
    const adjusted = c && raw !== undefined && raw !== c.close ? `（原始收盤 ${raw}，換算成今天股數基準）` : '';
    return { role: `${role}${c ? `（${day(c.tradeDate)}）` : ''}${adjusted}`, fiscalYear: null, fiscalQuarter: null, type: 'other', statementType: null, fieldKey: null, sourceDescription: SOURCE, value: c ? Number(c.close.toFixed(4)) : null };
  };
  const inWindow = closes.filter((c) => c.tradeDate > windowStart);
  const extreme = (pick: (a: DailyClose, b: DailyClose) => DailyClose) => (inWindow.length > 0 ? inWindow.reduce(pick) : undefined);

  const latest = closeEntry('最新收盤價', closes.at(-1));
  const entries: ProvenanceEntry[] =
    metricCode === 'priceReturn52w'
      ? [latest, closeEntry(`一年前（${day(windowStart)}）當天或之前最後一個交易日收盤價`, closes.filter((c) => c.tradeDate <= windowStart).at(-1))]
      : metricCode === 'distanceFrom52wHigh'
        ? [latest, closeEntry('52 週最高收盤價', extreme((a, b) => (b.close > a.close ? b : a)))]
        : [latest, closeEntry('52 週最低收盤價', extreme((a, b) => (b.close < a.close ? b : a)))];
  for (const ch of changes) {
    entries.push({ role: `股數基準變動（${day(ch.date)} 起，股數 × ${ch.multiplier}）`, fiscalYear: null, fiscalQuarter: null, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開資訊觀測站股利分派與股本變動（除權、面額變更、減資）', value: ch.multiplier });
  }

  const value = { priceReturn52w: result.priceReturn, distanceFrom52wHigh: result.distanceFromHigh, distanceFrom52wLow: result.distanceFromLow }[metricCode].value;
  return {
    symbol,
    metricCode,
    found: true,
    fiscalYear: null,
    fiscalQuarter: null,
    value,
    entries,
    methodologyNote:
      `計算日 ${day(tradeDate)}，窗口 ${day(windowStart)}（不含）～${day(tradeDate)}。只算股價、不含現金股利；股數基準變動日之前的收盤價 ÷ 股數倍數，` +
      `換算成今天的股數基準。上市未滿一年（序列開始得比 ${day(windowStart)} 晚）不算。`,
  };
};
