import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { PREFERRED_STOCK_FIELD_CATALOG, FORMULA_MAX_LENGTH, findOverlongFormulas } from '@/api/bff/preferredStock/fieldCatalog';

describe('PREFERRED_STOCK_FIELD_CATALOG', () => {
  test('真正的 catalog 裡每一筆 formula 文案都不超過長度上限（module 載入時已經檢查過一次，這裡再驗證一次讓失敗原因在測試報告裡看得到）', () => {
    assert.deepEqual(findOverlongFormulas(PREFERRED_STOCK_FIELD_CATALOG, FORMULA_MAX_LENGTH), []);
  });

  test('findOverlongFormulas 對合成的超長 formula 應該正確抓出來，不是形同虛設的檢查', () => {
    const overlong = 'a'.repeat(FORMULA_MAX_LENGTH + 1);
    const problems = findOverlongFormulas([{ field: 'fakeField', label: '假欄位', formula: overlong, inputs: [] }], FORMULA_MAX_LENGTH);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /fakeField/);
  });

  test('findOverlongFormulas 對剛好等於上限的長度不應該判定為違規（邊界值）', () => {
    const exact = 'a'.repeat(FORMULA_MAX_LENGTH);
    assert.deepEqual(findOverlongFormulas([{ field: 'fakeField', label: '假欄位', formula: exact, inputs: [] }], FORMULA_MAX_LENGTH), []);
  });
});
