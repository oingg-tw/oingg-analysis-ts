import { describe, expect, test } from 'vitest';
import assert from 'node:assert/strict';
import { getFieldDistribution, ScreenerValidationError } from '@/application/screener/service';
import type { FieldDistribution, MetricValueQueryPort } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../fakes/createTestDeps';

// getFieldDistribution 本身是薄包裝（field 解析 + 原樣轉發 port 結果 + 補回 field 字串），
// 分箱數學本身的正確性由 tests/unit/domain/shared/distribution.test.ts 釘住，這裡只驗證
// use case 這一層的行為：field 解析錯誤丟 ValidationError、結果原樣帶回。

const distributionPort = (result: FieldDistribution): Pick<MetricValueQueryPort, 'distribution'> => ({
  distribution: async () => result,
});

describe('getFieldDistribution', () => {
  test('field 格式錯誤（沒有點）丟 ValidationError', async () => {
    const deps = createTestDeps({ metricValueQueries: distributionPort({ totalCount: 0, trueMin: null, trueMax: null, clippedMin: null, clippedMax: null, bins: [] }) as MetricValueQueryPort });
    await assert.rejects(() => getFieldDistribution('roe', 20, deps), ScreenerValidationError);
  });

  test('查無資料時原樣回傳空 bins，field 帶回請求時的字串', async () => {
    const deps = createTestDeps({ metricValueQueries: distributionPort({ totalCount: 0, trueMin: null, trueMax: null, clippedMin: null, clippedMax: null, bins: [] }) as MetricValueQueryPort });
    const result = await getFieldDistribution('dividendYield.EOD', 20, deps);
    expect(result).toEqual({ field: 'dividendYield.EOD', totalCount: 0, trueMin: null, trueMax: null, clippedMin: null, clippedMax: null, bins: [] });
  });

  test('有資料時把 port 回傳的分布結果原樣帶回，只補上 field', async () => {
    const distribution: FieldDistribution = {
      totalCount: 100,
      trueMin: 0,
      trueMax: 50,
      clippedMin: 0.5,
      clippedMax: 12,
      bins: [{ min: 0.5, max: 6.25, count: 60 }, { min: 6.25, max: 12, count: 40 }],
    };
    const deps = createTestDeps({ metricValueQueries: distributionPort(distribution) as MetricValueQueryPort });
    const result = await getFieldDistribution('dividendYield.EOD', 2, deps);
    expect(result).toEqual({ field: 'dividendYield.EOD', ...distribution });
  });
});
