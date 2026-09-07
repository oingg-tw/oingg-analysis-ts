import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { getTableForMetric, resolveField, validateMetricTableRegistry, deriveShape } from '@/api/bff/filter/metricTableRegistry';

describe('metricTableRegistry', () => {
  test('真正的 filterCatalog.ts 裡每個 metric 都應該能解析出對應的 table（不拋錯）', () => {
    assert.doesNotThrow(() => validateMetricTableRegistry(false));
  });

  // 2026-09-07：舊架構 34 張季報型 Result 表已經全部 DROP（使用者要求，這批已經有 pitMetrics
  // 版本可查），目前 filterCatalog 裡已經沒有任何真正的季報型 model 存活（只剩 beta/
  // marketRatios 兩個日資料型），沒辦法再用真的 metricKey 整合測試這個分支——改用合成的
  // ModelIntrospection 物件直接測 deriveShape 這支純函式，保留對這個判斷邏輯本身的驗證
  // （這個分支是刻意保留給未來可能重新登記季報型舊架構指標的空殼，見 metricTableRegistry.ts
  // 的說明）。
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

  // 2026-09-05 原本用 'ma' 當每日型範例，technicals 分類（含 ma）已經整個刪除
  // （使用者決定），改用 'per'（valuation_market_ratios，同樣是逐日市場資料，不是季度財報）。
  test('每日型（daily）metric 解析出正確的日期欄位——tradeDate/trade_date', () => {
    const info = getTableForMetric('per');
    assert.ok(info);
    assert.equal(info!.shape, 'daily');
    assert.equal(info!.dateColumn, 'trade_date');
  });

  // 2026-09-04 之前 beta 的 DB 欄位叫 as_of_date，是同一服務內唯一的日資料型命名例外
  // （其他全部叫 trade_date），已經跟其他日資料型結果表統一改成 trade_date（見
  // docs/ubiquitous-language-glossary.md），這裡不再是特例。
  test('beta 分類在 portfolio 底下，日期欄位跟其他日資料型指標一樣是 trade_date', () => {
    const info = getTableForMetric('beta');
    assert.ok(info);
    assert.equal(info!.shape, 'daily');
    assert.equal(info!.dateColumn, 'trade_date');
  });

  test('per/pbr/dividendYield 三個 metricKey 都指向同一張 valuation_market_ratios（modelKey: marketRatios）', () => {
    assert.equal(getTableForMetric('per')!.tableName, 'valuation_market_ratios');
    assert.equal(getTableForMetric('pbr')!.tableName, 'valuation_market_ratios');
    assert.equal(getTableForMetric('dividendYield')!.tableName, 'valuation_market_ratios');
  });

  test('resolveField 解析出欄位的實際資料庫欄名', () => {
    const field = resolveField('per', 'peRatio');
    assert.ok(field);
    assert.equal(field!.valueColumn, 'pe_ratio');
    assert.equal(field!.tableName, 'valuation_market_ratios');
  });

  test('resolveField 對不存在的 field 回傳 null，不拋錯', () => {
    assert.equal(resolveField('per', 'notARealField'), null);
  });

  test('resolveField/getTableForMetric 對不存在的 metricKey 回傳 null，不拋錯', () => {
    assert.equal(resolveField('notARealMetric', 'x'), null);
    assert.equal(getTableForMetric('notARealMetric'), null);
  });
});
