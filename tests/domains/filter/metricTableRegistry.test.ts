import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTableForMetric, resolveField, validateMetricTableRegistry } from '@/domains/filter/metricTableRegistry';

describe('metricTableRegistry', () => {
  test('真正的 filterCatalog.ts 裡每個 metric 都應該能解析出對應的 table（不拋錯）', () => {
    assert.doesNotThrow(() => validateMetricTableRegistry(false));
  });

  test('季報型（quarterly）metric 解析出正確的表名跟五個 PK 欄位的資料庫欄名', () => {
    const info = getTableForMetric('roe');
    assert.ok(info);
    assert.equal(info!.modelName, 'RoeResult');
    assert.equal(info!.tableName, 'profitability_roe');
    assert.equal(info!.shape, 'quarterly');
    assert.deepEqual(info!.quarterlyFilterColumns, {
      yearColumn: 'year',
      seasonColumn: 'season',
      dataTypeColumn: 'data_type',
      subsidiaryCompanyIdColumn: 'subsidiary_company_id',
    });
  });

  test('每日型（daily）metric 解析出正確的日期欄位——tradeDate/trade_date', () => {
    const info = getTableForMetric('ma');
    assert.ok(info);
    assert.equal(info!.shape, 'daily');
    assert.equal(info!.dateColumn, 'trade_date');
  });

  test('beta 雖然分類在 portfolio 底下，日期欄位是 as_of_date，不是 trade_date', () => {
    const info = getTableForMetric('beta');
    assert.ok(info);
    assert.equal(info!.shape, 'daily');
    assert.equal(info!.dateColumn, 'as_of_date');
  });

  test('per/pbr/dividendYield 三個 metricKey 都指向同一張 valuation_market_ratios（modelKey: marketRatios）', () => {
    assert.equal(getTableForMetric('per')!.tableName, 'valuation_market_ratios');
    assert.equal(getTableForMetric('pbr')!.tableName, 'valuation_market_ratios');
    assert.equal(getTableForMetric('dividendYield')!.tableName, 'valuation_market_ratios');
  });

  test('resolveField 解析出欄位的實際資料庫欄名', () => {
    const field = resolveField('roe', 'roeQuarterlyPct');
    assert.ok(field);
    assert.equal(field!.valueColumn, 'roe_quarterly_pct');
    assert.equal(field!.tableName, 'profitability_roe');
  });

  test('resolveField 對不存在的 field 回傳 null，不拋錯', () => {
    assert.equal(resolveField('roe', 'notARealField'), null);
  });

  test('resolveField/getTableForMetric 對不存在的 metricKey 回傳 null，不拋錯', () => {
    assert.equal(resolveField('notARealMetric', 'x'), null);
    assert.equal(getTableForMetric('notARealMetric'), null);
  });
});
