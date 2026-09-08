import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PREFERRED_STOCK_FIELD_CATALOG } from '@/api/bff/preferredStock/fieldCatalog';
import { preferredStockFieldCatalogEntrySchema } from '@/api/bff/preferredStock/types';

test('PREFERRED_STOCK_FIELD_CATALOG: 每一筆都符合 schema，field/formula/inputs 都不是空字串', () => {
  assert.ok(PREFERRED_STOCK_FIELD_CATALOG.length > 0);
  for (const entry of PREFERRED_STOCK_FIELD_CATALOG) {
    const parsed = preferredStockFieldCatalogEntrySchema.safeParse(entry);
    assert.ok(parsed.success, `${entry.field} 應該符合 schema：${JSON.stringify(parsed.error?.format())}`);
    assert.ok(entry.field.length > 0);
    assert.ok(entry.formula.length > 0);
    assert.ok(entry.inputs.length > 0, `${entry.field} 應該至少有一個 input`);
  }
});

test('PREFERRED_STOCK_FIELD_CATALOG: field 不應該重複', () => {
  const fields = PREFERRED_STOCK_FIELD_CATALOG.map((e) => e.field);
  assert.equal(new Set(fields).size, fields.length, '不應該有重複的 field 名稱');
});

// 這幾個是這個 session 實際做過的衍生欄位，鎖住一定要出現在目錄裡，避免之後改動漏掉。
test('PREFERRED_STOCK_FIELD_CATALOG: 應該涵蓋 ytwPct/ytcPct/ytcAssumption/premiumRatePct/currentYieldPct/nominalDividendRatePct', () => {
  const fields = new Set(PREFERRED_STOCK_FIELD_CATALOG.map((e) => e.field));
  for (const expected of ['ytwPct', 'ytcPct', 'ytcAssumption', 'premiumRatePct', 'currentYieldPct', 'nominalDividendRatePct']) {
    assert.ok(fields.has(expected), `field catalog 應該包含 ${expected}`);
  }
});
