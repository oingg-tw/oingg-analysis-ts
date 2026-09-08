import { test, afterAll, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { checkJobCompleteness } from '@/api/batch/completenessCheck';
import { computeAndWriteBankAssetQualityFamilyPit } from '@/pitMetrics/resilience/bankAssetQuality/computeBankAssetQualityFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { IndicatorJob } from '@/api/batch/indicatorJob';

// 2026-09-08：filterCatalog.csv 最後 6 列（beta/marketRatios）連同 BetaResult/
// MarketRatiosResult 兩張表一起退場——這代表整個 analysis schema 已經不再有任何
// 「一指標一張獨立 Result 表、用 symbol 當主鍵」的舊架構 model 存活（唯一倖存的
// EquityRiskPremiumResult 主鍵是 windowStart/windowEnd，不符合這個形狀）。
// checkJobCompleteness 因此新增了 pitMetrics 分支（見 completenessCheck.ts 的說明），
// 這裡改用真實存在的 pitMetrics 銀行監理指標 bankNplRatio 當測試道具——這支測試在驗證
// checkJobCompleteness 本身的邏輯，不是在驗證任何一支指標的公式，換哪個 metricCode
// 當範例不重要，只是要是真的能查到寫入紀錄的案例。

const bankNplRatioJob: IndicatorJob = {
  name: 'bankNplRatio',
  category: 'resilience',
  getCompanyIds: async () => [],
  run: (symbol) => computeAndWriteBankAssetQualityFamilyPit({ symbol, year: '115', season: '2', dataType: '2', subsidiaryCompanyId: '' }),
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

  const result = await checkJobCompleteness(bankNplRatioJob, ['2801'], batchStartedAt);

  assert.equal(result.attempted, 1);
  assert.equal(result.written, 1);
  assert.equal(result.coverageRatio, 1);
  assert.equal(result.skipped, undefined);
});

test('completenessCheck: 時間窗設在寫入之後，應該算不到（驗證真的有依時間篩選，不是無條件數總表列數）', async () => {
  await bankNplRatioJob.run('2801');
  const batchStartedAtInTheFuture = new Date(Date.now() + 60_000);

  const result = await checkJobCompleteness(bankNplRatioJob, ['2801'], batchStartedAtInTheFuture);

  assert.equal(result.written, 0);
  assert.equal(result.coverageRatio, 0);
});

test('completenessCheck: filterCatalog 找不到、也不是已註冊 pitMetrics metricCode 的 metricKey，應該回傳 skipped 而不是 throw', async () => {
  const bogusJob: IndicatorJob = { ...bankNplRatioJob, name: '__not_a_real_metric_key__' };

  const result = await checkJobCompleteness(bogusJob, ['2801'], new Date());

  assert.ok(result.skipped, 'metricKey 解析不出對應資料表時應該回傳 skipped 原因');
});

test('completenessCheck: 空的 companyIds 視為完整（沒有攻打對象，無所謂完整度）', async () => {
  const result = await checkJobCompleteness(bankNplRatioJob, [], new Date());

  assert.equal(result.attempted, 0);
  assert.equal(result.written, 0);
  assert.equal(result.coverageRatio, 1);
});

afterAll(async () => {
  await mopsExportPrisma.$disconnect();
  await analysisPrisma.$disconnect();
});
