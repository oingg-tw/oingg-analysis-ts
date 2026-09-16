import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeIncomeStatementPerShare } from '@/application/metrics/profitability/incomeStatementPerShare/computeIncomeStatementPerShare';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('incomeStatementPerSharePit');

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟
// tests/pitMetrics/epsPit.test.ts 同一種形狀，只是分子換成毛利/營業利益。

test('incomeStatementPerSharePit: 2330 115Q2 合併報表，兩個 metric_code 都應該寫入且毛利大於營業利益', async () => {
  await replay.run(computeIncomeStatementPerShare)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatest = (metricCode: string, periodType: string) =>
    replay.findLatest({ symbol: '2330', metricCode, periodType, fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  const grossQ = await findLatest('grossProfitPerShare', 'Q');
  const opQ = await findLatest('operatingIncomePerShare', 'Q');

  assert.ok(grossQ && opQ, '兩個 metric_code 都應該寫入 Q periodType');
  assert.ok(Number(grossQ!.value) > 0, '2330 每股毛利應該是正值');
  assert.ok(Number(grossQ!.value) > Number(opQ!.value), '毛利應該大於營業利益（營業利益 = 毛利 - 營業費用）');
});

test('incomeStatementPerSharePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeIncomeStatementPerShare)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.grossProfitPerShareQ, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: { in: ['grossProfitPerShare', 'operatingIncomePerShare'] } });
  assert.equal(count, 0);
});

