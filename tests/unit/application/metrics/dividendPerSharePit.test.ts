import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeDividendPerShare } from '@/application/metrics/dividend/dividendPerShare/computeDividendPerShare';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('dividendPerSharePit');

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟
// tests/pitMetrics/cashFlowPerSharePit.test.ts 同一種資料源，只有 TTM 一種 basis
// （跟 dividendPayoutRatio 同一個理由，股利通常一年發放1-2次，單季會嚴重失真）。

test('dividendPerSharePit: 2330 115Q2 合併報表，只寫入 TTM，值應該是非負正值', async () => {
  const outcome = await replay.run(computeDividendPerShare)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  assert.notEqual(outcome.ttm.action, 'skipped_no_quarter');

  const ttm = await replay.findLatest({ symbol: '2330', metricCode: 'dividendPerShare', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(ttm, 'TTM 應該寫入');
  // 2026-09-25 起是公告的普通股每股現金股利加總：2330 近一年（2025-07-01~2026-06-30）除息四次 5+5+6+6。
  assert.equal(Number(ttm!.value), 22);
});

test('dividendPerSharePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeDividendPerShare)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: 'dividendPerShare' });
  assert.equal(count, 0);
});

