import type { DailyClose } from '@/domain/metrics/valuation/fiftyTwoWeek/calculateFiftyTwoWeek';

// 2026-10-08 本益比／淨值比河流圖的純計算（使用者要「最專業」的算法，拍板：倍數用該公司自己的歷史百分位、後端算好）。
// 呼叫端負責兩件事，這裡只管對齊與統計：
// 1. 股價與每股基準都已換算到今天的股數基準（分割、配股、股數合併式減資；現金股利不換算）——跨事件時比值才連續。
// 2. 每股基準的 effectiveFrom 是財報公告日（knowledgeDate），不是季底——季底到公告日之間沿用上一份財報，不偷看未來。
// 帶狀倍數＝窗口內每個交易日「股價 ÷ 當天適用的基準」的 P10/P25/P50/P75/P90（基準 ≤ 0 或還沒有基準的日子不計），整張圖固定一組。
// 百分位不用最低～最高等分：虧損前後的超高本益比、上游資料錯誤（5314 股數位數）會把等分拉得很寬。
export const RIVER_PERCENTILES = [10, 25, 50, 75, 90] as const;

export interface RiverBase {
  effectiveFrom: Date;
  base: number | null; // null 或 ≤ 0：這段期間沒有比值（近四季 EPS 虧損等）
}

export interface ValuationRiverResult {
  multiples: { percentile: number; multiple: number }[] | null; // 窗口內沒有任何有效比值時 null
  // 2026-10-08 web-nuxt 要求一併給最小／最大值：他們的使用者原本要「最低～最高等分五條河道」，等分或百分位由前端選，這裡兩種都給。
  ratioRange: { min: number; max: number } | null;
  current: { tradeDate: Date; price: number; base: number | null; ratio: number | null; percentile: number | null } | null;
  sampleDays: number; // 進入百分位計算的交易日數
}

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

// 線性內插百分位（Hyndman & Fan 第 7 型，Excel PERCENTILE.INC／numpy 預設）。sorted 由小到大、至少一筆。
export const percentileOf = (sorted: number[], p: number): number => {
  const h = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(h);
  return sorted[lo]! + (h - lo) * (sorted[Math.min(lo + 1, sorted.length - 1)]! - sorted[lo]!);
};

// 每個交易日適用的基準：effectiveFrom ≤ 交易日的最後一筆；basesAsc 依 effectiveFrom 由舊到新。
export const baseOn = (basesAsc: RiverBase[], tradeDate: Date): number | null => {
  let base: number | null = null;
  for (const b of basesAsc) {
    if (b.effectiveFrom > tradeDate) break;
    base = b.base;
  }
  return base;
};

// closesAsc：已換算、已去重、由舊到新，只含窗口內的交易日。
export const calculateValuationRiver = (closesAsc: DailyClose[], basesAsc: RiverBase[]): ValuationRiverResult => {
  const ratios = closesAsc.flatMap((c) => {
    const base = baseOn(basesAsc, c.tradeDate);
    return base !== null && base > 0 ? [c.close / base] : [];
  });
  const sorted = [...ratios].sort((a, b) => a - b);
  const multiples = sorted.length > 0 ? RIVER_PERCENTILES.map((percentile) => ({ percentile, multiple: round(percentileOf(sorted, percentile), 2) })) : null;

  const last = closesAsc.at(-1);
  const ratioRange = sorted.length > 0 ? { min: round(sorted[0]!, 2), max: round(sorted.at(-1)!, 2) } : null;
  if (!last) return { multiples, ratioRange, current: null, sampleDays: sorted.length };
  const base = baseOn(basesAsc, last.tradeDate);
  const ratio = base !== null && base > 0 ? last.close / base : null;
  // 目前比值在自己歷史裡的位置＝窗口內比值 ≤ 目前比值的天數占比。
  const percentile = ratio !== null && sorted.length > 0 ? round((sorted.filter((r) => r <= ratio).length / sorted.length) * 100, 1) : null;
  return {
    multiples,
    ratioRange,
    current: { tradeDate: last.tradeDate, price: round(last.close, 2), base, ratio: ratio === null ? null : round(ratio, 2), percentile },
    sampleDays: sorted.length,
  };
};
