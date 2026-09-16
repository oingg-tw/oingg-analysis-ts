import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { computeAndWriteOhlsonOScorePit } from '@/bootstrap/pitMetrics';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';

// 第四批（guru 分類）遷移——Logit 財務危機預警模型，NITA/FUTL/INTWO/CHIN 需要「本年 TTM」
// 跟「去年同季 TTM」兩個窗口，去年同季錨點用 getPastNQuarters({rocYear,season},5)[0]。
// oScore 本身跟 tests/domains/metrics/ohlsonOScore.test.ts 只驗證合理區間（負值 + 破產
// 機率 < 0.01，跟既有測試檔案的斷言一致），因為要查兩年份 TTM 窗口共 8 季資料，比單季
// 查詢慢，延長逾時。

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.ohlsonOScore!);
});

test(
  'ohlsonOScorePit: 2330 115Q2 合併報表（只有 TTM 口徑），寫入的值應該落在合理區間',
  async () => {
    await computeAndWriteOhlsonOScorePit({ symbol: '2330', year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });

    const ttm = await analysisPrisma.metricValue.findFirst({
      where: { symbol: '2330', metricCode: 'ohlsonOScore', periodType: 'TTM', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
      orderBy: { knowledgeDate: 'desc' },
    });

    assert.ok(ttm, '本年 TTM、去年 TTM、資產負債表都齊全，basis=TTM 應該有寫入');
    if (ttm!.value !== null) {
      const oScore = Number(ttm!.value);
      assert.ok(oScore < 0, `oScore=${oScore} 應該是負值（台積電財務體質健康，破產風險低）`);
      const probabilityOfBankruptcy = 1 / (1 + Math.exp(-oScore));
      assert.ok(probabilityOfBankruptcy < 0.01, `probabilityOfBankruptcy=${probabilityOfBankruptcy} 應該遠低於 0.5`);
    }
  },
  20000
);

test('ohlsonOScorePit: 9999（查無資料的公司）應該優雅降級，不寫入', async () => {
  const outcome = await computeAndWriteOhlsonOScorePit({ symbol: '9999', dataType: '2', subsidiaryCompanyId: '' });

  assert.deepEqual(outcome.ttm, { action: 'skipped_no_quarter' });
  const count = await analysisPrisma.metricValue.count({ where: { symbol: '9999', metricCode: 'ohlsonOScore' } });
  assert.equal(count, 0);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
