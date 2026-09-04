// 技術分析指標的純數學運算——只吃/吐數字陣列，不碰資料庫，方便獨立測試（見
// tests/shared/technicalMath.test.ts）。所有函式都假設輸入陣列已經依日期**升冪**排序
// （最舊的在前面，最新的在最後面），跟 src/shared/sourceData/priceSeries.ts 回傳的順序一致。
//
// **資料量不足一律回傳 null，不是拋錯或硬湊**——技術指標需要至少 N 期歷史才有意義，
// 資料筆數不夠時代表「這家公司目前這個視窗還算不出來」，屬於 MetricStatusCode 的 'no_data'
// （上游資料之後補齊，重新查詢就會有值），呼叫端負責轉換成 fieldStatuses，這裡只管數學本身。

// SMA：最近 N 筆的算術平均。
export const simpleMovingAverage = (values: number[], window: number): number | null => {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / window) * 100) / 100;
};

// EMA 完整序列（跟輸入陣列等長，前面不足以計算的位置是 null）——MACD 的 DIF 需要先算出完整
// EMA(12)/EMA(26) 序列才能相減，DEM 又要對 DIF 序列再做一次 EMA(9)，所以需要序列版本，
// 不是只回傳最新一個值。
//
// **seed 方式**：第 window-1 個位置（從陣列開頭數）用該視窗的 SMA 當種子，之後每一筆用
// `k = 2/(window+1)` 遞迴平滑——這是最常見的 EMA 慣例（TradingView、多數看盤軟體都這樣做），
// 但代表 EMA 的準確度會隨可用歷史筆數增加而收斂，資料筆數只比 window 多一點點時數值僅供參考，
// 呼叫端（MACD service）會在這種情況加上警告文字，不是這裡的責任。
export const exponentialMovingAverageSeries = (values: number[], window: number): (number | null)[] => {
  const result: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (values.length < window) return result;

  const k = 2 / (window + 1);
  const seedSlice = values.slice(0, window);
  let prevEma = seedSlice.reduce((acc, v) => acc + v, 0) / window;
  result[window - 1] = Math.round(prevEma * 10000) / 10000;

  for (let i = window; i < values.length; i++) {
    prevEma = values[i]! * k + prevEma * (1 - k);
    result[i] = Math.round(prevEma * 10000) / 10000;
  }
  return result;
};

// 只要最新一個 EMA 值時的簡便包裝。
export const exponentialMovingAverage = (values: number[], window: number): number | null => {
  const series = exponentialMovingAverageSeries(values, window);
  return series[series.length - 1] ?? null;
};

// 母體標準差（分母是 N，不是 N-1）——布林通道的業界慣例算法，不是統計課本的樣本標準差。
export const populationStdDev = (values: number[]): number => {
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

export interface BollingerBands {
  middle: number;
  upper: number;
  lower: number;
}

// middle = SMA(window)，upper/lower = middle ± multiplier 個標準差（母體標準差，用同一個視窗的收盤價）。
export const bollingerBands = (closes: number[], window: number, multiplier: number): BollingerBands | null => {
  if (closes.length < window) return null;
  const slice = closes.slice(-window);
  const middle = slice.reduce((acc, v) => acc + v, 0) / window;
  const stdDev = populationStdDev(slice);
  return {
    middle: Math.round(middle * 100) / 100,
    upper: Math.round((middle + multiplier * stdDev) * 100) / 100,
    lower: Math.round((middle - multiplier * stdDev) * 100) / 100,
  };
};

// Wilder's RSI——第一個平均漲跌幅用前 window 期漲跌幅的簡單平均當種子，之後用 Wilder 平滑
// （`avg = (avg_prev * (window-1) + current) / window`）遞迴計算，是 RSI 最初、也是業界最常見
// 的版本（跟直接用簡單移動平均算漲跌幅平均的簡化版不同）。
// 需要 window+1 筆收盤價才能算出 window 筆漲跌幅，所以門檻是 closes.length >= window + 1。
export const wilderRsi = (closes: number[], window: number): number | null => {
  if (closes.length < window + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i]! - closes[i - 1]!);

  const seedChanges = changes.slice(0, window);
  let avgGain = seedChanges.reduce((acc, c) => acc + (c > 0 ? c : 0), 0) / window;
  let avgLoss = seedChanges.reduce((acc, c) => acc + (c < 0 ? -c : 0), 0) / window;

  for (let i = window; i < changes.length; i++) {
    const change = changes[i]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (window - 1) + gain) / window;
    avgLoss = (avgLoss * (window - 1) + loss) / window;
  }

  if (avgLoss === 0) return 100; // 期間內完全沒有下跌，RSI 定義上是 100，不是除以零報錯。
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
};

// 真實波動幅度（單一期）：max(高-低, |高-前收|, |低-前收|)。
const trueRange = (high: number, low: number, prevClose: number): number => Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

// ATR：真實波動幅度的 Wilder 平滑移動平均，跟 RSI 同一種「前 window 期簡單平均當種子、
// 之後遞迴平滑」的 Wilder 慣例。需要 window+1 筆高低收才能算出 window 筆真實波動幅度。
export const averageTrueRange = (highs: number[], lows: number[], closes: number[], window: number): number | null => {
  if (highs.length < window + 1 || lows.length !== highs.length || closes.length !== highs.length) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) trueRanges.push(trueRange(highs[i]!, lows[i]!, closes[i - 1]!));

  const seedTr = trueRanges.slice(0, window);
  let atr = seedTr.reduce((acc, tr) => acc + tr, 0) / window;
  for (let i = window; i < trueRanges.length; i++) atr = (atr * (window - 1) + trueRanges[i]!) / window;

  return Math.round(atr * 100) / 100;
};

export interface StochasticKD {
  k: number;
  d: number;
}

// KD（隨機指標）：RSV = (收盤 - 期間最低) / (期間最高 - 期間最低) * 100，K/D 用
// `2/3 * 前值 + 1/3 * 新值` 遞迴平滑，K/D 初始值用業界慣例的 50（不是第一筆 RSV，避免第一筆
// 剛好落在極端值時失真）。需要從最早能算出 RSV 的地方（第 window 筆）開始往後跑完整個序列，
// 不能只看最新一天的 RSV 就直接當 K/D，因為 K/D 本身依賴遞迴的歷史狀態。
export const stochasticKD = (highs: number[], lows: number[], closes: number[], window: number): StochasticKD | null => {
  if (highs.length < window || lows.length !== highs.length || closes.length !== highs.length) return null;

  let k = 50;
  let d = 50;
  for (let i = window - 1; i < closes.length; i++) {
    const windowHighs = highs.slice(i - window + 1, i + 1);
    const windowLows = lows.slice(i - window + 1, i + 1);
    const highestHigh = Math.max(...windowHighs);
    const lowestLow = Math.min(...windowLows);
    const rsv = highestHigh === lowestLow ? 50 : ((closes[i]! - lowestLow) / (highestHigh - lowestLow)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }

  return { k: Math.round(k * 100) / 100, d: Math.round(d * 100) / 100 };
};

// BIAS（乖離率） = (收盤 - MA) / MA * 100%——純比率運算，MA 由呼叫端傳入（複用 simpleMovingAverage
// 算好的值），這裡不重複算一次 MA。
export const bias = (close: number, movingAverage: number): number | null => {
  if (movingAverage === 0) return null;
  return Math.round(((close - movingAverage) / movingAverage) * 100 * 100) / 100;
};

// OBV（能量潮）：從序列最開頭累加，收盤價比前一天高就加成交量、比前一天低就減成交量、打平不動。
// 是從資料庫目前收錄的最早一筆開始算的累積值，不是某個固定「起始日」的絕對值——不同公司/查詢
// 時間點抓到的歷史起點不同，OBV 的絕對值本身沒有跨公司比較意義，只有「同一公司內的變化趨勢」
// 才有意義，這是 OBV 這個指標的常見用法，不是本服務的簡化。
export const onBalanceVolume = (closes: number[], volumes: bigint[]): bigint | null => {
  if (closes.length === 0 || closes.length !== volumes.length) return null;
  let obv = 0n;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i]! > closes[i - 1]!) obv += volumes[i]!;
    else if (closes[i]! < closes[i - 1]!) obv -= volumes[i]!;
  }
  return obv;
};
