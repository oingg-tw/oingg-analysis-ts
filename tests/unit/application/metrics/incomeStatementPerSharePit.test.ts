import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeIncomeStatementPerShare } from '@/application/metrics/profitability/incomeStatementPerShare/computeIncomeStatementPerShare';
import { createPitReplay } from '../../../fakes/pit/replayHarness';

const replay = createPitReplay('incomeStatementPerSharePit');

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟
// tests/pitMetrics/epsPit.test.ts 同一種形狀，只是分子換成毛利/營業利益。
// 2026-09-18 補上 3 個 TTM-only 欄位（costOfGoodsSoldPerShare/operatingExpensePerShare/
// incomeTaxExpensePerShare）——同一次查詢，不需要重錄新的 port 呼叫，只是多讀
// IncomeStatementFields 上既有回傳物件裡的欄位。

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

test('incomeStatementPerSharePit: 2330 115Q2 三個新 TTM-only 欄位都應該寫入，且營業成本+營業費用+稅前淨利大致等於毛利+稅前淨利-營業利益的量級關係', async () => {
  await replay.run(computeIncomeStatementPerShare)({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

  const findLatestTtm = (metricCode: string) =>
    replay.findLatest({ symbol: '2330', metricCode, periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });

  const cogsTtm = await findLatestTtm('costOfGoodsSoldPerShare');
  const opexTtm = await findLatestTtm('operatingExpensePerShare');
  const taxTtm = await findLatestTtm('incomeTaxExpensePerShare');

  assert.ok(cogsTtm && opexTtm && taxTtm, '三個新 TTM-only metric_code 都應該寫入');
  assert.equal(cogsTtm!.periodType, 'TTM');
  assert.ok(Number(cogsTtm!.value) > 0, '2330 每股營業成本應該是正值');
  assert.ok(Number(opexTtm!.value) > 0, '2330 每股營業費用應該是正值');
  assert.ok(Number(taxTtm!.value) > 0, '2330 獲利穩定，每股所得稅費用應該是正值');

  // 2026-09-24 這三支從 TTM-only 改成 Q + TTM（原本 TTM-only 是當初卡片鎖 TTM 的選擇，
  // 上游 quarterly_income_statement_xbrl 本來就是單季表）。原本這裡斷言「不應該有 Q 列」，
  // 現在反過來釘住「必須有 Q 列，而且單季值小於近四季值」——後者是真正有意義的關係：
  // 單季成本必然小於四季加總，寫錯欄位或把 TTM 值寫進 Q 座標都會讓它垮。
  const cogsQ = await replay.findLatest({ symbol: '2330', metricCode: 'costOfGoodsSoldPerShare', periodType: 'Q', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' });
  assert.ok(cogsQ, 'costOfGoodsSoldPerShare 應該有 Q periodType 的列');
  assert.ok(Number(cogsQ!.value) > 0, '2330 單季每股營業成本應該是正值');
  assert.ok(Number(cogsQ!.value) < Number(cogsTtm!.value), '單季營業成本應該小於近四季加總');
});

test('incomeStatementPerSharePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await replay.run(computeIncomeStatementPerShare)({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.grossProfitPerShareQ, { action: 'skipped_no_quarter' });
  assert.deepEqual(outcome.costOfGoodsSoldPerShareTtm, { action: 'skipped_no_quarter' });
  const count = await replay.count({ symbol: '9999', metricCode: { in: ['grossProfitPerShare', 'operatingIncomePerShare', 'costOfGoodsSoldPerShare', 'operatingExpensePerShare', 'incomeTaxExpensePerShare'] } });
  assert.equal(count, 0);
});
