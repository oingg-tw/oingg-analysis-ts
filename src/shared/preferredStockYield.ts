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

export type YtcAssumption = 'scheduled_redemption_date' | 'past_redemption_date_assumed_next_period' | 'no_scheduled_redemption_date_assumed_next_period';

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

// 2026-09-08 新增：有些可贖回特別股（例如 1312A 國喬特、2002A 中鋼特）條款本身就沒有
// 訂定任何收回日期（公司可隨時自行決定），跟「本來有排定日期、但已經過了」是不同的
// 起點狀態，不應該套用 resolveYtcPeriods 需要一個真實 Date 才能判斷「過了沒」的邏輯——
// 但兩者的實質風險完全一樣：發行人隨時可能贖回、選擇還沒動作，沒有下一個確定時點，
// 所以沿用同一個 n=1「假設下一次配息後即被贖回」簡化，只是用獨立的 assumption 值標記
// 清楚「這裡從來就沒有排定日期」，不要跟「有日期、已經過期」混為一談——前端顯示警語時
// 這兩種情境的措辭應該不一樣。
export const resolveYtcPeriodsWithoutScheduledDate = (): { periods: number; assumption: YtcAssumption } => ({
  periods: 1,
  assumption: 'no_scheduled_redemption_date_assumed_next_period',
});
