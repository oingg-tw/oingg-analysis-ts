import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { scanMetricFolderCatalog } from '@/api/bff/filter/metricFolderCatalog';
import { metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';

// 2026-09-08：取代舊架構的 filterCatalog.csv（連同整套 filterCatalog/screener/
// metricsService 機制一起退場，見 abstract-crafting-journal.md）——這支直接掃描
// src/pitMetrics/<分類>/<指標>/ 資料夾結構，不是手動維護的清單。

describe('scanMetricFolderCatalog', () => {
  test('每個分類底下的每個 metricCode，都必須是 metricDefinitionRegistry 裡真實註冊的 key（不是編排資料夾誤判成指標）', () => {
    const categories = scanMetricFolderCatalog();
    assert.ok(categories.length > 0, '掃描結果不應該是空的——pitMetrics 底下已經有大量指標資料夾');
    for (const category of categories) {
      assert.ok(category.metrics.length > 0, `分類 "${category.categoryKey}" 不應該出現在結果裡卻沒有任何指標`);
      for (const metric of category.metrics) {
        assert.ok(metric.metricCode in metricDefinitionRegistry, `"${metric.metricCode}"（分類 "${category.categoryKey}"）應該要在 metricDefinitionRegistry 裡`);
        const definition = metricDefinitionRegistry[metric.metricCode]!;
        assert.deepEqual(metric.allowedPeriodTypes, definition.allowedPeriodTypes);
        assert.deepEqual(metric.allowedLookbackRanges, definition.allowedLookbackRanges);
        assert.deepEqual(metric.allowedSamplingIntervals, definition.allowedSamplingIntervals);
        assert.deepEqual(metric.allowedSnapshotCadences, definition.allowedSnapshotCadences);
      }
    }
  });

  test('編排資料夾（turnoverRatio/margins/bankAssetQuality/bankCapitalAdequacy/cashFlowPerShare/liquidityRatio）本身不應該被誤判成獨立指標', () => {
    const categories = scanMetricFolderCatalog();
    const allMetricCodes = categories.flatMap((c) => c.metrics.map((m) => m.metricCode));
    for (const orchestrationFolderName of ['turnoverRatio', 'margins', 'bankAssetQuality', 'bankCapitalAdequacy', 'cashFlowPerShare', 'liquidityRatio']) {
      assert.ok(!allMetricCodes.includes(orchestrationFolderName), `"${orchestrationFolderName}" 是編排資料夾名稱，不是真的 metricCode，不應該出現在結果裡`);
    }
  });

  test('shared/、chip/ 兩個分類不應該出現在結果裡', () => {
    const categories = scanMetricFolderCatalog();
    const categoryKeys = categories.map((c) => c.categoryKey);
    assert.ok(!categoryKeys.includes('shared'), 'shared/ 底下放的是編排邏輯（dupont/marketRatios），資料夾名稱本身不是 metricCode');
    assert.ok(!categoryKeys.includes('chip'), 'chip/ 目前是空殼分類，還沒有任何指標遷入');
  });

  test('已知真實指標（roe/beta/bankNplRatio）應該出現在對應分類裡', () => {
    const categories = scanMetricFolderCatalog();
    const findMetric = (categoryKey: string, metricCode: string) => categories.find((c) => c.categoryKey === categoryKey)?.metrics.some((m) => m.metricCode === metricCode);

    assert.ok(findMetric('profitability', 'roe'), 'roe 應該出現在 profitability 分類');
    assert.ok(findMetric('valuation', 'beta'), 'beta 應該出現在 valuation 分類');
    assert.ok(findMetric('resilience', 'bankNplRatio'), 'bankNplRatio 應該出現在 resilience 分類');
  });
});
