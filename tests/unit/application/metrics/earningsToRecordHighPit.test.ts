import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeEarningsToRecordHigh } from '@/application/metrics/growth/earningsToRecordHigh/computeEarningsToRecordHigh';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters } from '@/domain/calendar/rocQuarter';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('earningsToRecordHighPit');

// 2026-09-21 盈餘創新高比率（顧廣平等 2025 的近三年變體）——不釘死 2330 的數字（淨利會隨上游重編
// 變動），改用同一份 cassette 的損益表獨立重算「本季淨利 / 前 12 季最高淨利」，斷言 compute 的契約：
// 窗口是「前 12 季、不含本季」、分母取最大值、結果是百分比四捨五入到小數 2 位。
test('earningsToRecordHighPit: 2330 115Q2 = 本季淨利 / 前 12 季（不含本季）最高單季淨利 * 100', async () => {
  await replay.run(computeEarningsToRecordHigh)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const row = await replay.findLatest({ symbol: '2330', metricCode: 'earningsToRecordHigh', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2 });
  assert.ok(row && row.value !== null, 'earningsToRecordHigh.Q 應該有值');

  const statement = async (year: number, quarter: number) =>
    pickNetIncome(await replay.deps.statements.getIncomeStatement({ symbol: '2330', year, quarter, dataType: '2', subsidiaryCompanyId: '' })).value;
  const current = await statement(115, 2);
  const priors = await Promise.all(
    getPastNQuarters({ rocYear: 115, season: '2' }, 13)
      .slice(0, 12)
      .map((q) => statement(Number(q.year), Number(q.season)))
  );
  assert.ok(current !== null && priors.every((v) => v !== null), 'cassette 應該錄到 13 季淨利');
  const recordHigh = (priors as bigint[]).reduce((max, v) => (v > max ? v : max));
  const expected = Math.round((Number(current) / Number(recordHigh)) * 100 * 100) / 100;

  assert.equal(row!.value, expected);
  assert.ok(row!.value! > 0);
});

test('earningsToRecordHighPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeEarningsToRecordHigh)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.q, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'earningsToRecordHigh' });
  assert.equal(count, 0);
});
