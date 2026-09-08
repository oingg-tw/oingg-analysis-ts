import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { getTableForMetric, resolveField, validateMetricTableRegistry, deriveShape } from '@/api/bff/filter/metricTableRegistry';

describe('metricTableRegistry', () => {
  test('真正的 filterCatalog.ts 裡每個 metric 都應該能解析出對應的 table（不拋錯，catalog 目前是空的，等於零檢查對象）', () => {
    assert.doesNotThrow(() => validateMetricTableRegistry(false));
  });

  // 2026-09-07：舊架構 34 張季報型 Result 表已經全部 DROP（使用者要求，這批已經有 pitMetrics
  // 版本可查），目前 filterCatalog 裡已經沒有任何真正的季報型 model 存活——沒辦法再用真的
  // metricKey 整合測試這個分支，改用合成的 ModelIntrospection 物件直接測 deriveShape 這支
  // 純函式，保留對這個判斷邏輯本身的驗證（這個分支是刻意保留給未來可能重新登記季報型舊架構
  // 指標的空殼，見 metricTableRegistry.ts 的說明）。
  test('季報型（quarterly）metric 解析出正確的表名跟五個 PK 欄位的資料庫欄名', () => {
    const syntheticModel = {
      modelName: 'FakeQuarterlyResult',
      tableName: 'fake_quarterly',
      idFields: ['symbol', 'year', 'season', 'dataType', 'subsidiaryCompanyId'],
      fields: new Map([
        ['year', { columnName: 'year', type: 'Int' }],
        ['season', { columnName: 'season', type: 'Int' }],
        ['dataType', { columnName: 'data_type', type: 'String' }],
        ['subsidiaryCompanyId', { columnName: 'subsidiary_company_id', type: 'String' }],
      ]),
    };
    const info = deriveShape(syntheticModel);
    assert.equal(info.shape, 'quarterly');
    assert.deepEqual(info.quarterlyFilterColumns, {
      yearColumn: 'year',
      seasonColumn: 'season',
      dataTypeColumn: 'data_type',
      subsidiaryCompanyIdColumn: 'subsidiary_company_id',
    });
  });

  // 2026-09-08：filterCatalog.csv 最後 6 列（beta/marketRatios）退場，連同 BetaResult/
  // MarketRatiosResult 兩張表一起 DROP——這代表 schema 裡已經沒有任何真正的日資料型
  // （daily-shape，@@id 是 symbol + 單一日期欄位）model 存活了，跟上面季報型分支同一個處境，
  // 改用合成的 ModelIntrospection 物件單獨測 deriveShape 的 daily 分支。
  test('日資料型（daily，@@id 是 symbol + 單一日期欄位）metric 解析出正確的日期欄位', () => {
    const syntheticModel = {
      modelName: 'FakeDailyResult',
      tableName: 'fake_daily',
      idFields: ['symbol', 'tradeDate'],
      fields: new Map([['tradeDate', { columnName: 'trade_date', type: 'DateTime' }]]),
    };
    const info = deriveShape(syntheticModel);
    assert.equal(info.shape, 'daily');
    assert.equal(info.dateColumn, 'trade_date');
  });

  test('getTableForMetric/resolveField 對不存在的 metricKey 回傳 null，不拋錯（catalog 目前是空的，任何 metricKey 都查不到）', () => {
    assert.equal(getTableForMetric('per'), null);
    assert.equal(getTableForMetric('beta'), null);
    assert.equal(getTableForMetric('notARealMetric'), null);
    assert.equal(resolveField('per', 'peRatio'), null);
    assert.equal(resolveField('notARealMetric', 'x'), null);
  });
});
