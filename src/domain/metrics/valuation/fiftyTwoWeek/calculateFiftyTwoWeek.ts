import { round2, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// 52 週三支（priceReturn52w / distanceFrom52wHigh / distanceFrom52wLow）的純計算，2026-10-07 使用者要求的可排行指標。
//
// - **只算股價，不含現金股利**（使用者 2026-10-07 選定）：除息日的股價下跌照算成跌幅，跟下單軟體的漲跌幅一致。
// - **股數基準一定還原**：配股、分割、面額變更、減資（shareChange 事件，市場實際換基準的那天）之前的收盤 ÷ multiplier，
//   換算成今天的股數基準——否則 5904 這類面額 10→1 會出現假的 −90%。
// - **用收盤價**不用盤中高低：George & Hwang (2004) 的 52 週高點用日收盤價；也省掉改 daily_price 查詢。
export interface DailyClose {
  tradeDate: Date;
  close: number;
}

export interface PriceBasisChange {
  date: Date; // 市場以新股數基準交易的第一天
  multiplier: number; // 股數 × multiplier（股價 ÷ multiplier）
}

export interface FiftyTwoWeekResult {
  priceReturn: CalcResult;
  distanceFromHigh: CalcResult;
  distanceFromLow: CalcResult;
}

// 轉板公司上市、上櫃兩邊各有一段，同一天可能兩列：保留先出現的那列（呼叫端傳入的序列上市在前，等於上市優先）。
export const dedupeByTradeDate = (closesAsc: DailyClose[]): DailyClose[] => {
  const seen = new Set<number>();
  return closesAsc.filter((c) => !seen.has(c.tradeDate.getTime()) && seen.add(c.tradeDate.getTime()));
};

export const adjustForBasisChanges = (closesAsc: DailyClose[], changes: PriceBasisChange[]): DailyClose[] =>
  closesAsc.map((c) => ({ ...c, close: changes.reduce((price, ch) => (c.tradeDate < ch.date ? price / ch.multiplier : price), c.close) }));

const insufficient: FiftyTwoWeekResult = {
  priceReturn: { value: null, nullReason: 'insufficient_history' },
  distanceFromHigh: { value: null, nullReason: 'insufficient_history' },
  distanceFromLow: { value: null, nullReason: 'insufficient_history' },
};

const percentFrom = (latest: number, reference: number): CalcResult => ({ value: round2((latest / reference - 1) * 100), nullReason: null });

// closesAsc：已去重、已還原、由舊到新，最後一筆是計算日；windowStart = 計算日往前一年。
// 窗口起點收盤 = windowStart 當天或之前最後一筆收盤；序列開始得比 windowStart 晚（上市未滿一年）→ 三支都 insufficient_history，
// 不拿較短的窗口頂替（「52 週」的高低點拿半年資料算就不是同一個東西）。
export const calculateFiftyTwoWeek = (closesAsc: DailyClose[], windowStart: Date): FiftyTwoWeekResult => {
  const base = closesAsc.filter((c) => c.tradeDate <= windowStart).at(-1);
  const latest = closesAsc.at(-1);
  if (!base || !latest || latest.tradeDate <= windowStart) return insufficient;
  const window = closesAsc.filter((c) => c.tradeDate > windowStart).map((c) => c.close);
  return {
    priceReturn: percentFrom(latest.close, base.close),
    distanceFromHigh: percentFrom(latest.close, Math.max(...window)),
    distanceFromLow: percentFrom(latest.close, Math.min(...window)),
  };
};
