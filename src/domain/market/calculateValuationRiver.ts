import type { DailyClose } from '@/domain/metrics/valuation/fiftyTwoWeek/calculateFiftyTwoWeek';

// 2026-10-08 本益比／淨值比／股價營收比河流圖的純計算（使用者要「最專業」的算法、後端算好）。
// 呼叫端負責兩件事，這裡只管對齊與統計：
// 1. 股價與每股基準都已換算到今天的股數基準（分割、配股、股數合併式減資；現金股利不換算）——跨事件時比值才連續。
// 2. 每股基準的 effectiveFrom 是財報公告日（knowledgeDate），不是季底——季底到公告日之間沿用上一份財報，不偷看未來。
// 河道（使用者 2026-10-08 拍板「第 5～95 百分位截尾後等分五條」）：窗口內每個交易日「股價 ÷ 當天適用的基準」（基準 ≤ 0 或還沒有基準的日子不計）
// 取第 5、第 95 百分位當上下緣，中間等分成五條河道（六條線），整張圖固定一組倍數。
// - 為什麼不用最低～最高：一個極端日子就決定整張圖的寬度。實測 2603 航運暴賺時本益比 0.8 倍、2755 短暫衝到 7.1 倍，最上面一條河道都只有 1% 的天數；
//   上游錯資料（5314 股數位數）也會把河道撐開好幾倍。截掉兩端各 5% 後，穩定的公司（2412、2330）看起來跟最低～最高幾乎一樣。
// - 為什麼不用 P10/P25/P50/P75/P90 當線：那是 5 條線、4 條河道，web-nuxt 的使用者要的是「分五條、依各股歷史區間自動切」。
// - 代價：約 10% 的日子比值落在最外兩條線之外（股價線跑出河道），前端照畫、沒有河道底色。
export const RIVER_TRIM_PERCENTILES = { lower: 5, upper: 95 } as const;
export const RIVER_BAND_COUNT = 5;

export interface RiverBase {
  effectiveFrom: Date;
  base: number | null; // null 或 ≤ 0：這段期間沒有比值（近四季 EPS 虧損等）
}

export interface ValuationRiverResult {
  bandMultiples: number[] | null; // 六條線的倍數，由低到高（第 5 百分位 … 第 95 百分位，等距）；窗口內沒有任何有效比值時 null
  ratioRange: { min: number; max: number } | null; // 窗口內實際最低／最高比值（說明有多少日子落在河道外用）
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
  const lower = sorted.length > 0 ? percentileOf(sorted, RIVER_TRIM_PERCENTILES.lower) : null;
  const upper = sorted.length > 0 ? percentileOf(sorted, RIVER_TRIM_PERCENTILES.upper) : null;
  const bandMultiples = lower !== null && upper !== null ? Array.from({ length: RIVER_BAND_COUNT + 1 }, (_, i) => round(lower + ((upper - lower) * i) / RIVER_BAND_COUNT, 2)) : null;

  const last = closesAsc.at(-1);
  const ratioRange = sorted.length > 0 ? { min: round(sorted[0]!, 2), max: round(sorted.at(-1)!, 2) } : null;
  if (!last) return { bandMultiples, ratioRange, current: null, sampleDays: sorted.length };
  const base = baseOn(basesAsc, last.tradeDate);
  const ratio = base !== null && base > 0 ? last.close / base : null;
  // 目前比值在自己歷史裡的位置＝窗口內比值 ≤ 目前比值的天數占比。
  const percentile = ratio !== null && sorted.length > 0 ? round((sorted.filter((r) => r <= ratio).length / sorted.length) * 100, 1) : null;
  return {
    bandMultiples,
    ratioRange,
    current: { tradeDate: last.tradeDate, price: round(last.close, 2), base, ratio: ratio === null ? null : round(ratio, 2), percentile },
    sampleDays: sorted.length,
  };
};
