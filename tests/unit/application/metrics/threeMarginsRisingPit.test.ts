import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeThreeMarginsRising } from '@/application/metrics/growth/threeMarginsRising/computeThreeMarginsRising';
import { computeMarginsFamily } from '@/application/metrics/profitability/margins/computeMarginsFamily';
import { computeDupontFamily } from '@/application/metrics/shared/dupont/computeDupontFamily';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('threeMarginsRisingPit');

// 2026-09-21 三率三升（複合指標，出處是台灣財經媒體慣用語，見 threeMarginsRisingBadge.ts）——
// 不釘死 2330 的分數是幾分（三率的真實數字會隨上游重編變動，見 tests/README.md 的原則），改成
// 「分數必須等於三率各自『本季>上一季 且 本季>去年同季』判定後的加總」：這才是這支 compute 真正
// 的契約（復用既有 grossMargin/operatingMargin/netProfitMargin 的計算、不重寫公式、三個座標各自
// 對齊本季/上一季/去年同季）。

const at = (metricCode: string, fiscalYear: number, fiscalQuarter: number) => ({
  symbol: '2330',
  metricCode,
  periodType: 'Q' as const,
  fiscalYear,
  fiscalQuarter,
  dataType: '2',
  subsidiaryCompanyId: '',
});

test(
  'threeMarginsRisingPit: 2330 115Q2 的分數 = 三率各自「本季>上季 且 本季>去年同季」的加總，座標涵蓋本季/上季/去年同季',
  async () => {
    await replay.run(computeThreeMarginsRising)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeMarginsFamily)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeDupontFamily)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeMarginsFamily)({ symbol: '2330', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeDupontFamily)({ symbol: '2330', year: '115', season: '1', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeMarginsFamily)({ symbol: '2330', year: '114', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    await replay.run(computeDupontFamily)({ symbol: '2330', year: '114', season: '2', dataType: '2', subsidiaryCompanyId: '' });

    const score = await replay.findLatest(at('threeMarginsRising', 2026, 2));
    assert.ok(score, 'threeMarginsRising.Q 應該有寫入');

    const [grossCurrent, grossQoq, grossYoy, operatingCurrent, operatingQoq, operatingYoy, netCurrent, netQoq, netYoy] = await Promise.all([
      replay.findLatest(at('grossMargin', 2026, 2)),
      replay.findLatest(at('grossMargin', 2026, 1)),
      replay.findLatest(at('grossMargin', 2025, 2)),
      replay.findLatest(at('operatingMargin', 2026, 2)),
      replay.findLatest(at('operatingMargin', 2026, 1)),
      replay.findLatest(at('operatingMargin', 2025, 2)),
      replay.findLatest(at('netProfitMargin', 2026, 2)),
      replay.findLatest(at('netProfitMargin', 2026, 1)),
      replay.findLatest(at('netProfitMargin', 2025, 2)),
    ]);

    const risingBoth = (current: typeof grossCurrent, qoq: typeof grossQoq, yoy: typeof grossYoy): boolean | null => {
      if (!current || !qoq || !yoy || current.value === null || qoq.value === null || yoy.value === null) return null;
      return Number(current.value) > Number(qoq.value) && Number(current.value) > Number(yoy.value);
    };

    const signals = [risingBoth(grossCurrent, grossQoq, grossYoy), risingBoth(operatingCurrent, operatingQoq, operatingYoy), risingBoth(netCurrent, netQoq, netYoy)];
    assert.ok(
      signals.every((s) => s !== null),
      '2330 115Q2/115Q1/114Q2 三率都應該有值（2330 有完整近期歷史）'
    );
    const expected = signals.reduce((sum: number, s) => sum + (s ? 1 : 0), 0);

    assert.equal(score!.nullReason, null);
    assert.equal(Number(score!.value), expected);
    assert.ok(Number(score!.value) >= 0 && Number(score!.value) <= 3);
  },
  30000
);

test('threeMarginsRisingPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeThreeMarginsRising)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'threeMarginsRising' });
  assert.equal(count, 0);
});
