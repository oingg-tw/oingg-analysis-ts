import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { persistMetricValue } from '@/bootstrap/pitMetrics';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';

// 2026-09-11：全市場 backfill 平行化後真實發生過的 race condition——writeMetricValue（2026-09-17 Phase 3
// 起是 persistComputations.persistOne，這裡走 bootstrap 綁好真實 repository 的 persistMetricValue）
// 原本是「findFirst 查有沒有既有列，查無資料才 create」，兩個併發呼叫剛好同時查到
// 「沒有」、同時嘗試 create 同一個座標，第二個會撞 metric_values_identity_key 唯一鍵
// 拋出 UniqueConstraintViolation（symbol=2104 metricCode=revenuePerShare 那次真實案例）。
// 這支測試直接模擬「兩個併發呼叫寫入完全相同的新座標」，驗證改用 upsert 後不會再拋出
// 例外，且最終只會有一列（不會重複，也不會漏寫）。

// 2026-09-17 Phase 5 flaky 政策：每次執行用唯一的假 symbol（跟既有的 ZZTEST9999 一樣是 10 碼、不會撞真實代號），
// 兩個 vitest worker 或上一次中斷沒清乾淨的殘留列都不會互相干擾；afterAll 只清自己這次寫的列。
const TEST_SYMBOL = `ZZT${Math.random().toString(36).slice(2, 9).toUpperCase().padEnd(7, '0')}`;
const TEST_FISCAL_YEAR = 2019;
const TEST_FISCAL_QUARTER = 1;

// 2026-09-23：formulaVersion 從 registry 讀，不寫死。persistOne 的座標驗證會擋掉「跟定義宣告的
// currentFormulaVersion 不符」的寫入（2026-09-22 加的守門），而 roe 同日從期末分母改成期間平均、
// 版本升到 2——這支測試當時沒跟著改，從那天起就一直是 rejected。寫死版本號只會在下次改版重演，
// 改成讀定義本身，這支測試以後不會再因為公式改版而失效。
const ROE_FORMULA_VERSION = metricDefinitionRegistry.roe!.currentFormulaVersion;

const buildInput = (value: number) => ({
  symbol: TEST_SYMBOL,
  metricCode: 'roe',
  formulaVersion: ROE_FORMULA_VERSION,
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

test('persistOne: 兩個併發呼叫寫入完全相同的新座標，不應該拋出 UniqueConstraintViolation，且最終只有一列', async () => {
  const [resultA, resultB] = await Promise.all([persistMetricValue(buildInput(12.34)), persistMetricValue(buildInput(12.34))]);

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
