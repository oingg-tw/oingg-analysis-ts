// 特別股 YTW（最差殖利率）/負凸性警示的純函式計算層——不碰 DB，方便獨立單元測試。
// 2026-09-07 依 conductor-ts「特別股指標計算引擎」規劃文件的公式實作，只做文件裡標註
// 優先評估的 YTW/負凸性警示這兩支（DM/有效存續期/OAS 需要利率樹模型，複雜度高很多，
// 這次不做）。
//
// YTW = min(YTC, YTP)。YTP（永續殖利率，P0=D/y_YTP）就是既有的 currentYieldPct，不用
// 重算。YTC（贖回殖利率）沒有封閉解（跟債券 YTM 一樣），用二分法對
// f(y) = Σ_{t=1}^{n} D/(1+y)^t + CallPrice/(1+y)^n - P0 求根——f(y) 對 y 嚴格遞減，
// 二分法穩定收斂，不需要 Newton-Raphson 的導數計算。

const YTC_LOWER_BOUND = -0.99; // -99%
const YTC_UPPER_BOUND = 10; // 1000%
const YTC_MAX_ITERATIONS = 100;
const YTC_TOLERANCE = 1e-8;

const presentValueAtYield = (y: number, dividendRate: number, callPrice: number, periods: number): number => {
  let pv = 0;
  for (let t = 1; t <= periods; t++) {
    pv += dividendRate / (1 + y) ** t;
  }
  pv += callPrice / (1 + y) ** periods;
  return pv;
};

// 二分法求解年化殖利率（小數，例如 0.1234 = 12.34%），f(y) 嚴格遞減保證收斂。
export const solveYieldToCall = (params: { currentPrice: number; dividendRate: number; callPrice: number; periods: number }): number => {
  const { currentPrice, dividendRate, callPrice, periods } = params;
  let low = YTC_LOWER_BOUND;
  let high = YTC_UPPER_BOUND;

  for (let i = 0; i < YTC_MAX_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const pvAtMid = presentValueAtYield(mid, dividendRate, callPrice, periods);
    if (Math.abs(pvAtMid - currentPrice) < YTC_TOLERANCE) return mid;
    // pv 對 y 嚴格遞減：pv 太高代表 y 猜太低，要往上調。
    if (pvAtMid > currentPrice) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
};

export type YtcAssumption = 'scheduled_redemption_date' | 'past_redemption_date_assumed_next_period';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// 贖回日在未來：n=實際到贖回日的年數（無條件進位，最小值 1）；贖回日已過（發行人隨時
// 可能贖回但選擇還沒贖回，沒有下一個確定贖回時點）：n=1，假設「下一次配息後即被贖回」的
// 簡化情境，靠 assumption 標記清楚告訴呼叫端這是假設不是真實排定的時間。
export const resolveYtcPeriods = (redemptionDate: Date, asOfDate: Date): { periods: number; assumption: YtcAssumption } => {
  const diffMs = redemptionDate.getTime() - asOfDate.getTime();
  if (diffMs <= 0) {
    return { periods: 1, assumption: 'past_redemption_date_assumed_next_period' };
  }
  const periods = Math.max(1, Math.ceil(diffMs / MS_PER_YEAR));
  return { periods, assumption: 'scheduled_redemption_date' };
};

// 負凸性警示：現價相對贖回價（發行價）溢價 >2% 時觸發——現價已經漲超過發行人贖回會
// 支付的價格，投資人有被迫在高於市場認知價值處被贖回的風險。
export const calculateNegativeConvexityWarning = (currentPrice: number, callPrice: number): boolean => {
  if (callPrice === 0) return false;
  return (currentPrice - callPrice) / callPrice > 0.02;
};
