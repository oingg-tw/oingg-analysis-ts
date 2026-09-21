import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeSue, SUE_FORMULA_VERSION } from '@/application/metrics/growth/sue/computeSue';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters } from '@/domain/calendar/rocQuarter';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('suePit');

// 2026-09-21 SUE 換成顧廣平（2011）定義（見 computeSue.ts）——用同一份 cassette 的損益表獨立重算
// (E_t − E_{t−4} − μ) / σ，μ、σ 取前 8 季盈餘變動值的平均數與樣本標準差，斷言 compute 的契約：
// 13 季窗口、漂移項、樣本標準差（ddof=1）、四捨五入 2 位、formulaVersion 2。不釘死 2330 的數字。
test('suePit: 2330 115Q2 = (本季變動 − 前 8 季變動平均) / 前 8 季變動樣本標準差，formulaVersion 2', async () => {
  const outcome = await replay.run(computeSue)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(outcome.q.action, 'inserted');

  const row = await replay.findLatest({ symbol: '2330', metricCode: 'sue', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2 });
  assert.ok(row && row.value !== null, 'sue.Q 應該有值');
  assert.equal(row!.formulaVersion, SUE_FORMULA_VERSION);

  const quarters = getPastNQuarters({ rocYear: 115, season: '2' }, 13);
  const e = await Promise.all(
    quarters.map(async (q) => pickNetIncome(await replay.deps.statements.getIncomeStatement({ symbol: '2330', year: Number(q.year), quarter: Number(q.season), dataType: '2', subsidiaryCompanyId: '' })).value)
  );
  assert.ok(e.every((v) => v !== null), 'cassette 應該錄到 13 季淨利');
  const change = (k: number) => Number(e[12 - k]! - e[12 - k - 4]!);
  const window = [1, 2, 3, 4, 5, 6, 7, 8].map(change);
  const mu = window.reduce((s, v) => s + v, 0) / 8;
  const sigma = Math.sqrt(window.reduce((s, v) => s + (v - mu) ** 2, 0) / 7);
  const expected = Math.round(((change(0) - mu) / sigma) * 100) / 100;

  assert.equal(row!.value, expected);
});

test('suePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeSue)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  assert.equal(await replay.count({ symbol: '9999', metricCode: 'sue' }), 0);
});
