import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { checkJobCompleteness } from '@/application/batch/completenessCheck';
import { appDeps } from '@/bootstrap/deps';
import { computeAndWriteBankAssetQualityFamilyPit } from '@/bootstrap/pitMetrics';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { upsertMetricDefinition } from '@/bootstrap/metricDefinitions';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { analysisPrisma } from '@/infrastructure/prisma/analysisClient';
import type { IndicatorJob } from '@/application/batch/indicatorJob';

// checkJobCompleteness 現在只走 pitMetrics 的 metric_values 這一條路徑（舊架構「一指標
// 一張獨立 Result 表」的 model 已經全部退場，連同 filterCatalog/metricTableRegistry 這套
// 解析機制一起刪除，見 abstract-crafting-journal.md）。這裡用真實存在的 pitMetrics
// 銀行監理指標 bankNplRatio 當測試道具——這支測試在驗證 checkJobCompleteness 本身的邏輯，
// 不是在驗證任何一支指標的公式，換哪個 metricCode 當範例不重要，只是要是真的能查到寫入
// 紀錄的案例。

const bankNplRatioJob: IndicatorJob = {
  name: 'bankNplRatio',
  category: 'resilience',
  getCompanyIds: async () => [],
  run: async (symbol) => {
    await computeAndWriteBankAssetQualityFamilyPit({ symbol, year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' });
    return { warnings: [] };
  },
};

// writeMetricValue 值沒變時是 skipped_unchanged（不落地任何寫入、不更新 computedAt，
// 見 metricValueWriter.ts），2801 115Q2 這組座標的值是固定的（真實財報資料，不會變），
// 重複執行這支測試檔案會撞到「上一次已經寫過同樣的值」，導致這次重算被跳過、written
// 誤判成 0——每個測試案例開始前都要先清掉這組座標既有的列，確保 run() 一定會是真正的
// insert，computedAt 才會確實是「現在」。
const clearExistingRow = () =>
  analysisPrisma.metricValue.deleteMany({
    where: { symbol: '2801', metricCode: 'bankNplRatio', fiscalYear: 2026, fiscalQuarter: 2, dataType: '2', subsidiaryCompanyId: '' },
  });

beforeAll(async () => {
  await upsertMetricDefinition(metricDefinitionRegistry.bankNplRatio!);
});

test('completenessCheck: 剛寫入的一列，時間窗設在寫入之前，應該被算進 written', async () => {
  await clearExistingRow();
  const batchStartedAt = new Date();
  await bankNplRatioJob.run('2801');

  const result = await checkJobCompleteness(bankNplRatioJob, ['2801'], batchStartedAt, appDeps);

  assert.equal(result.attempted, 1);
  assert.equal(result.written, 1);
  assert.equal(result.coverageRatio, 1);
  assert.equal(result.skipped, undefined);
});

test('completenessCheck: 時間窗設在寫入之後，應該算不到（驗證真的有依時間篩選，不是無條件數總表列數）', async () => {
  await bankNplRatioJob.run('2801');
  const batchStartedAtInTheFuture = new Date(Date.now() + 60_000);

  const result = await checkJobCompleteness(bankNplRatioJob, ['2801'], batchStartedAtInTheFuture, appDeps);

  assert.equal(result.written, 0);
  assert.equal(result.coverageRatio, 0);
});

test('completenessCheck: 不是已註冊 pitMetrics metricCode 的 metricKey，應該回傳 skipped 而不是 throw', async () => {
  const bogusJob: IndicatorJob = { ...bankNplRatioJob, name: '__not_a_real_metric_key__' };

  const result = await checkJobCompleteness(bogusJob, ['2801'], new Date(), appDeps);

  assert.ok(result.skipped, 'metricKey 不是已註冊的 metricCode 時應該回傳 skipped 原因');
});

test('completenessCheck: 空的 companyIds 視為完整（沒有攻打對象，無所謂完整度）', async () => {
  const result = await checkJobCompleteness(bankNplRatioJob, [], new Date(), appDeps);

  assert.equal(result.attempted, 0);
  assert.equal(result.written, 0);
  assert.equal(result.coverageRatio, 1);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
