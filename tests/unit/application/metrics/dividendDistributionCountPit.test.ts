import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeDividendDistributionCount } from '@/application/metrics/dividend/dividendDistributionCount/computeDividendDistributionCount';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('dividendDistributionCountPit');

// 2026-09-15 應使用者要求新增——「過去一年配息次數」，反推自 mops-ts 的股利分派公告
// （見 infrastructure/repositories/mops/dividendDistribution.ts 的完整說明）。2330（台積電）是使用者
// 主動請 mops-ts 插隊回補的驗證案例，2019年起穩定季配，用它驗證「應該算出4次」；
// 同時不寫死是不是精確等於4（playwright-py資料經驗教訓：資料源持續在變動，這裡雖然
// 是mops-ts不是playwright-py，但同一種「不要預設資料不會變」的態度還是適用），改成
// 驗證「至少有一次、次數落在1~4的合理範圍」這種結構性質。
// 「repository 真的查得到一批公司」的案例 2026-09-17 拆到
// tests/integration/infrastructure/repositories/mops/dividendDistribution.test.ts。

test('dividendDistributionCountPit: 2330 應該算出過去一年配息次數，落在合理範圍', async () => {
  const outcome = await replay.run(computeDividendDistributionCount)({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.ttm.action, 'skipped_no_quarter');

  const rows = await replay.findMany({ symbol: '2330', metricCode: 'dividendDistributionCount', periodType: 'TTM' });
  assert.ok(rows.length > 0, '應該至少寫入一筆');
  const latest = rows[0]!;
  const count = Number(latest.value);
  assert.ok(count >= 1 && count <= 4, `過去一年配息次數應該落在 1~4 之間（合理範圍），實際 ${count}`);
  assert.equal(latest.nullReason, null);
});

test('dividendDistributionCountPit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeDividendDistributionCount)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'dividendDistributionCount' });
  assert.equal(count, 0);
});
