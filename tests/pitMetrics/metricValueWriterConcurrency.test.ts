import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { writeMetricValue, periodTypeGroup } from '@/application/metrics/metricValueWriter';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 2026-09-11：全市場 backfill 平行化後真實發生過的 race condition——writeMetricValue
// 原本是「findFirst 查有沒有既有列，查無資料才 create」，兩個併發呼叫剛好同時查到
// 「沒有」、同時嘗試 create 同一個座標，第二個會撞 metric_values_identity_key 唯一鍵
// 拋出 UniqueConstraintViolation（symbol=2104 metricCode=revenuePerShare 那次真實案例）。
// 這支測試直接模擬「兩個併發呼叫寫入完全相同的新座標」，驗證改用 upsert 後不會再拋出
// 例外，且最終只會有一列（不會重複，也不會漏寫）。

const TEST_SYMBOL = 'ZZTEST9999';
const TEST_FISCAL_YEAR = 2019;
const TEST_FISCAL_QUARTER = 1;

const buildInput = (value: number) => ({
  symbol: TEST_SYMBOL,
  metricCode: 'roe',
  ...periodTypeGroup('TTM' as const),
  fiscalYear: TEST_FISCAL_YEAR,
  fiscalQuarter: TEST_FISCAL_QUARTER,
  dataType: '2',
  subsidiaryCompanyId: '',
  value,
  nullReason: null,
  knowledgeDate: new Date('2019-05-15'),
  knowledgeDateIsFallback: false,
});

test('writeMetricValue: 兩個併發呼叫寫入完全相同的新座標，不應該拋出 UniqueConstraintViolation，且最終只有一列', async () => {
  const [resultA, resultB] = await Promise.all([writeMetricValue(buildInput(12.34)), writeMetricValue(buildInput(12.34))]);

  // 兩個都應該正常完成（inserted 或 updated_same_knowledge_date 都算正常，不能是 rejected
  // 或直接拋出例外中斷整個 Promise.all）。
  assert.ok(resultA.action === 'inserted' || resultA.action === 'updated_same_knowledge_date', `resultA 不應該是 ${resultA.action}`);
  assert.ok(resultB.action === 'inserted' || resultB.action === 'updated_same_knowledge_date', `resultB 不應該是 ${resultB.action}`);

  const rows = await analysisPrisma.metricValue.findMany({
    where: { symbol: TEST_SYMBOL, metricCode: 'roe', periodType: 'TTM', fiscalYear: TEST_FISCAL_YEAR, fiscalQuarter: TEST_FISCAL_QUARTER, dataType: '2', subsidiaryCompanyId: '' },
  });
  assert.equal(rows.length, 1, '兩個併發呼叫寫入同一個座標，最終應該只有一列，不是兩列或零列');
  assert.equal(Number(rows[0]!.value), 12.34);
});

afterAll(async () => {
  await analysisPrisma.metricValue.deleteMany({ where: { symbol: TEST_SYMBOL } });
  await analysisPrisma.$disconnect();
});
