import { describe, expect, test } from 'vitest';
import { BETA_WINDOW_CONFIGS, calculateBetaCoefficient, calculateBetaWindow, resample, subtractYears, type OverlapPoint } from '@/domain/metrics/valuation/beta/calculateBeta';

// Phase 3 把 beta 的公式/降頻/窗口從 compute 搬成純函式後，第一次能不連資料庫釘住這些行為：
// 以前只能靠 tests/pitMetrics/betaPit.test.ts 打真實股價序列。

// 從 start 起產生 n 個「交易日」（跳過週六日）的重疊點：指數每天 +1，個股報酬率固定是指數報酬率的 k 倍。
const buildPoints = (n: number, k: number, start = '2026-06-01'): OverlapPoint[] => {
  const points: OverlapPoint[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  let indexClose = 100;
  let stockClose = 50;
  while (points.length < n) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      if (points.length > 0) {
        const prevIndex = indexClose;
        indexClose += 1;
        stockClose *= 1 + k * (indexClose / prevIndex - 1);
      }
      points.push({ tradeDate: cursor.toISOString().slice(0, 10), stockClose, indexClose });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
};

describe('resample：降頻取每個期間的最後一個交易日', () => {
  const points = buildPoints(15, 1); // 2026-06-01（週一）起三個完整交易週

  test('daily 原樣回傳', () => {
    expect(resample(points, 'daily')).toBe(points);
  });

  test('weekly 每個 ISO 週只留最後一個交易日（週五）', () => {
    const weekly = resample(points, 'weekly');
    expect(weekly.map((p) => p.tradeDate)).toEqual(['2026-06-05', '2026-06-12', '2026-06-19']);
  });

  test('monthly 每個月只留最後一個交易日', () => {
    const acrossMonths = buildPoints(25, 1, '2026-06-22'); // 跨 6 月→7 月
    const monthly = resample(acrossMonths, 'monthly');
    expect(monthly.map((p) => p.tradeDate.slice(0, 7))).toEqual(['2026-06', '2026-07']);
    expect(monthly[0]!.tradeDate).toBe('2026-06-30');
  });
});

describe('calculateBetaCoefficient：樣本共變異數 / 指數變異數', () => {
  test('個股報酬率恆為指數的 1.5 倍 → beta = 1.5（四捨五入到小數 4 位）', () => {
    const stock = [0.015, -0.03, 0.045, 0.0075];
    const index = [0.01, -0.02, 0.03, 0.005];
    expect(calculateBetaCoefficient(stock, index)).toBe(1.5);
  });

  test('樣本不足兩筆或指數變異數為 0 → null', () => {
    expect(calculateBetaCoefficient([0.01], [0.02])).toBeNull();
    expect(calculateBetaCoefficient([0.01, 0.02, 0.03], [0.01, 0.01, 0.01])).toBeNull();
  });
});

describe('calculateBetaWindow', () => {
  const daily = BETA_WINDOW_CONFIGS.find((c) => c.outputKey === 'beta1YDaily')!;

  test('降頻後不足 20 個取樣點 → insufficient_history，observations 回報實際點數', () => {
    const points = buildPoints(12, 1);
    const windowEnd = new Date(`${points[points.length - 1]!.tradeDate}T00:00:00.000Z`);
    expect(calculateBetaWindow(points, windowEnd, daily)).toEqual({ value: null, observations: 12, nullReason: 'insufficient_history' });
  });

  test('30 個交易日、個股報酬率是指數的 0.8 倍 → beta 0.8', () => {
    const points = buildPoints(30, 0.8);
    const windowEnd = new Date(`${points[points.length - 1]!.tradeDate}T00:00:00.000Z`);
    const result = calculateBetaWindow(points, windowEnd, daily);
    expect(result.observations).toBe(30);
    expect(result.nullReason).toBeNull();
    expect(result.value).toBeCloseTo(0.8, 4);
  });

  test('窗口只取 windowEnd 往前 N 年（含）之內的點', () => {
    const points = buildPoints(30, 1);
    const windowEnd = new Date(`${points[points.length - 1]!.tradeDate}T00:00:00.000Z`);
    const weekly2y = BETA_WINDOW_CONFIGS.find((c) => c.outputKey === 'beta2YWeekly')!;
    // 30 個交易日只有 6 個 ISO 週 → 週資料不足 20 個取樣點
    expect(calculateBetaWindow(points, windowEnd, weekly2y).nullReason).toBe('insufficient_history');
    expect(subtractYears(new Date('2026-09-01T00:00:00.000Z'), 2)).toEqual(new Date('2024-09-01T00:00:00.000Z'));
  });
});
