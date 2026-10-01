import { expect, test } from 'vitest';
import { computeBeta } from '@/application/metrics/valuation/beta/computeBeta';
import { getBetaProvenance } from '@/application/metrics/valuation/beta/getBetaProvenance';
import type { MetricComputation } from '@/domain/metrics/computation';
import { createTestPitDeps } from '../../../fakes/pit/createTestPitDeps';

// 2026-10-01 beta 溯源表：四個窗口全列、value 取 5Y×1M（徽章看的窗口），asOfDate 往回定位基準日，數字跟 computeBeta 寫入的四列一致。
// 個股每天的報酬率剛好是大盤的 1.5 倍 → 日頻窗口 Beta 恰好 1.5；週／月頻降頻後複利不再是剛好 1.5，只比對跟 computeBeta 相同。
const days: { trade_date: Date; index: number; stock: number }[] = [];
for (let t = Date.UTC(2020, 0, 1), index = 10000, stock = 100, i = 0; t <= Date.UTC(2026, 8, 30); t += 86_400_000) {
  const dow = new Date(t).getUTCDay();
  if (dow === 0 || dow === 6) continue;
  const r = 0.01 * Math.sin(i++ * 1.7);
  index *= 1 + r;
  stock *= 1 + 1.5 * r;
  days.push({ trade_date: new Date(t), index, stock });
}
const inRange = (since: Date, until?: Date) => days.filter((d) => d.trade_date >= since && (!until || d.trade_date <= until));
const deps = createTestPitDeps({
  market: {
    listDailyClosesSince: async (_symbol: string, since: Date, until?: Date) => inRange(since, until).map((d) => ({ trade_date: d.trade_date, close: d.stock })),
    listTaiexClosesSince: async (since: Date, until?: Date) => inRange(since, until).map((d) => ({ trade_date: d.trade_date, close: d.index })),
    getEarliestTradeDate: async () => days[0]!.trade_date,
  } as never,
});
const query = { symbol: '2330', dataType: '2', subsidiaryCompanyId: '' } as const;

test('四個窗口逐一列出、跟 computeBeta 四列同值；value 是 5Y×1M；日頻 Beta 恰好 1.5', async () => {
  const asOfDate = new Date('2026-06-14T00:00:00Z'); // 週日 → 基準日退到 6/12（週五）
  const [result, batch] = await Promise.all([getBetaProvenance({ symbol: '2330', asOfDate }, deps), computeBeta({ ...query, date: asOfDate }, deps)]);
  const slotValue = (key: keyof typeof batch.slots) => (batch.slots[key] as MetricComputation).value;

  expect(batch.tradeDate).toBe('2026-06-12');
  expect(result.entries[0]!.role).toBe('個股收盤價（基準日 2026-06-12）');
  const windowValue = (label: string) => result.entries.find((e) => e.role.includes(label))!.value;
  expect(windowValue('1Y×1D')).toBe(slotValue('beta1YDaily'));
  expect(windowValue('1Y×1D')).toBe(1.5);
  expect(windowValue('2Y×1W')).toBe(slotValue('beta2YWeekly'));
  expect(windowValue('3Y×1W')).toBe(slotValue('beta3YWeekly'));
  expect(windowValue('5Y×1M')).toBe(slotValue('beta5YMonthly'));
  expect(result.value).toBe(slotValue('beta5YMonthly'));
  expect(result.entries.find((e) => e.role.includes('5Y×1M'))!.role).toContain('2021-06-30～2026-06-12，61 個取樣點，本表數值');
});

test('完全沒有股價資料 found=false', async () => {
  const empty = createTestPitDeps({ market: { listDailyClosesSince: async () => [], listTaiexClosesSince: async () => [], getEarliestTradeDate: async () => null } as never });
  expect((await getBetaProvenance({ symbol: '9999' }, empty)).found).toBe(false);
});
