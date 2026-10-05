import { expect, test } from 'vitest';
import { computeLiveDividendPerShare } from '@/application/metrics/dividend/liveDividendPerShare/computeLiveDividendPerShare';
import type { DividendDistributionRow } from '@/application/ports/dividendEvents';
import { isComputationSkip, type MetricComputation } from '@/domain/metrics/computation';
import { createTestPitDeps } from '../../../../fakes/pit/createTestPitDeps';

// 2026-10-05 3231 的形狀：每年配一次，2025-06-03 配 3.8、2026-07-08 配 5.5。dividendPerShare.TTM（窗口截到 115Q2 季末 06-30）
// 兩次都落在窗口外變 0；近 12 個月（截至最新交易日）只收今年那次。
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const row = (ex: string, cash: number): DividendDistributionRow => ({
  rocFiscalYear: 114, fiscalQuarter: null, cashDividendFromEarnings: cash, cashDividendFromLegalReserveAndCapitalSurplus: null,
  stockDividendFromEarnings: null, stockDividendFromLegalReserveAndCapitalSurplus: null, exDividendDate: day(ex), exRightsDate: null, cashDividendPaymentDate: null, announcementDate: null,
});
const deps = (tradeDate: string, rows: DividendDistributionRow[]) =>
  createTestPitDeps({
    market: { getLatestDailyPrice: async () => ({ tradeDate: day(tradeDate), close: 100 }) } as never,
    dividendEvents: { listDividendDistributionRows: async () => rows } as never,
    shares: { getShareSplitFactor: async () => 1 } as never,
  });
const run = async (tradeDate: string, rows: DividendDistributionRow[]) => {
  const eod = (await computeLiveDividendPerShare({ symbol: '3231', dataType: '2', subsidiaryCompanyId: '' }, deps(tradeDate, rows))).slots.eod;
  if (isComputationSkip(eod)) throw new Error(JSON.stringify(eod));
  return eod as MetricComputation;
};

test('除息日比去年晚：近 12 個月只收今年那次，不會掉成 0', async () => {
  expect((await run('2026-10-02', [row('2025-06-03', 3.8), row('2026-07-08', 5.5)])).value).toBe(5.5);
});

test('窗口終點是最新交易日（含當天除息）；一年前同一天不含', async () => {
  expect((await run('2026-07-08', [row('2025-07-08', 3.8), row('2026-07-08', 5.5)])).value).toBe(5.5);
});

test('股利公告一筆都沒有 → null（missing_input），不是 0', async () => {
  const eod = await run('2026-10-02', []);
  expect([eod.value, eod.nullReason]).toEqual([null, 'missing_input']);
});
