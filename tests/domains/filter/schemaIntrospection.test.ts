import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { parseAnalysisSchemaModels } from '@/api/bff/filter/schemaIntrospection';

describe('parseAnalysisSchemaModels', () => {
  test('抽出 @@map 表名、@@id 主鍵欄位、每個欄位的 @map 資料庫欄名', () => {
    const schema = `
      model RoeResult {
        symbol              String
        year                Int    @map("year")
        season              Int    @map("season")
        dataType            String @map("data_type")
        subsidiaryCompanyId String @default("") @map("subsidiary_company_id")

        reportDate DateTime? @map("report_date") @db.Date

        roeQuarterlyPct Decimal? @map("roe_quarterly_pct") @db.Decimal(10, 2)

        @@id([symbol, year, season, dataType, subsidiaryCompanyId])
        @@map("profitability_roe")
      }
    `;
    const models = parseAnalysisSchemaModels(schema);
    const model = models.get('RoeResult');
    assert.ok(model);
    assert.equal(model!.tableName, 'profitability_roe');
    assert.deepEqual(model!.idFields, ['symbol', 'year', 'season', 'dataType', 'subsidiaryCompanyId']);
    assert.deepEqual(model!.fields.get('year'), { columnName: 'year', type: 'Int' });
    assert.deepEqual(model!.fields.get('subsidiaryCompanyId'), { columnName: 'subsidiary_company_id', type: 'String' });
    assert.deepEqual(model!.fields.get('roeQuarterlyPct'), { columnName: 'roe_quarterly_pct', type: 'Decimal' });
  });

  test('欄位沒有 @map 時，資料庫欄名等於欄位名本身（例如 dif/dem/osc 這種本來就是小寫的欄位）', () => {
    const schema = `
      model MacdResult {
        symbol String
        tradeDate DateTime @map("trade_date") @db.Date
        dif Decimal? @map("dif") @db.Decimal(10, 4)
        warnings String[]

        @@id([symbol, tradeDate])
        @@map("technicals_macd")
      }
    `;
    const model = parseAnalysisSchemaModels(schema).get('MacdResult');
    assert.deepEqual(model!.fields.get('warnings'), { columnName: 'warnings', type: 'String' });
  });

  test('沒有 @@map/@@id 的 model 回傳 null/空陣列，不拋錯', () => {
    const schema = `
      model SyncState {
        backend String
        dataset String
      }
    `;
    const model = parseAnalysisSchemaModels(schema).get('SyncState');
    assert.ok(model);
    assert.equal(model!.tableName, null);
    assert.deepEqual(model!.idFields, []);
  });

  test('可以在同一段 schema 文字裡解析多個 model', () => {
    const schema = `
      model A {
        symbol String
        @@id([symbol])
        @@map("table_a")
      }
      model B {
        symbol String
        @@id([symbol])
        @@map("table_b")
      }
    `;
    const models = parseAnalysisSchemaModels(schema);
    assert.equal(models.size, 2);
    assert.equal(models.get('A')!.tableName, 'table_a');
    assert.equal(models.get('B')!.tableName, 'table_b');
  });
});
