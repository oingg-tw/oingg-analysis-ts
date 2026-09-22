import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeCashFlowValuationFamily } from '@/application/metrics/shared/cashFlowValuationFamily/computeCashFlowValuationFamily';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('cashFlowValuationFamilyPit');

// 「全市場六季財報深度解鎖的指標」批次——一次查詢拆 8 個 TTM-only metricCode，見
// computeCashFlowValuationFamilyPit.ts 檔頭說明。用 2330 真實資料驗證。

const CODES = ['evToOcf', 'evToSales', 'priceToOcf', 'debtToFcf', 'capexToOcfRatio', 'croic', 'ocfMargin', 'fcfConversionRate'];

test('cashFlowValuationFamilyPit: 2330 八個 metricCode 都應該算出非 null 的 TTM 值', async () => {
  const outcome = await replay.run(computeCashFlowValuationFamily)({ symbol: '2330', dataType: '2', subsidiaryCompanyId: '' });
  assert.notEqual(outcome.rocYear, null);

  const rows = await replay.findMany({ symbol: '2330', metricCode: { in: CODES }, periodType: 'TTM' });
  const byCode = new Map(rows.map((r) => [r.metricCode, r]));

  for (const code of CODES) {
    const row = byCode.get(code);
    assert.ok(row, `${code} 應該有寫入`);
    assert.ok(row!.value !== null, `2330 資料完整，${code} 不應該是 null`);
  }
});

test('cashFlowValuationFamilyPit: capexToOcfRatio 應該是正數（絕對值），即使 capex 本身在 XBRL 是負數', async () => {
  const row = await replay.findLatest({ symbol: '2330', metricCode: 'capexToOcfRatio', periodType: 'TTM' });
  assert.ok(row);
  assert.ok(Number(row!.value) > 0, 'capexToOcfRatio 應該呈現正的比率，不是因為 capex 帶負號而變負數');

  // 2026-09-22 公式稽核：croic 的 unit 是 %，v1 漏乘 100（全市場中位數 0.11）。2330 的 FCF/投入資本以百分比看一定 > 1，
  // 以比率看一定 < 1——用這個量級守住尺度，不釘死數字。
  const croic = await replay.findLatest({ symbol: '2330', metricCode: 'croic', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2 });
  assert.ok(croic && croic.value !== null && Math.abs(Number(croic.value)) > 1, `croic 應該是百分比尺度，收到 ${croic?.value}`);
  assert.equal(croic!.formulaVersion, 2);
});

test('cashFlowValuationFamilyPit: 9999（查無資料的公司）應該優雅降級，全部 skipped_no_quarter', async () => {
  const outcome = await replay.run(computeCashFlowValuationFamily)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });
  assert.equal(outcome.rocYear, null);
  assert.deepEqual(outcome.evToOcf, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.fcfConversionRate, { action: 'skipped_no_quarter' });
});

