import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseEtfCategory } from '@/domainApi/market/etfRanking/parseCategory';

test('parseEtfCategory: null 回傳 null', () => {
  assert.equal(parseEtfCategory(null), null);
});

test('parseEtfCategory: 有成分類型後綴的上市/上櫃 ETF', () => {
  assert.deepEqual(parseEtfCategory('上市ETF_國外成分證券ETF'), { market: 'TWSE', assetClass: '國外成分證券' });
  assert.deepEqual(parseEtfCategory('上櫃ETF_債券成分ETF'), { market: 'TPEx', assetClass: '債券成分' });
  assert.deepEqual(parseEtfCategory('上市ETF_槓桿型ETF'), { market: 'TWSE', assetClass: '槓桿型' });
});

test('parseEtfCategory: 純「上市」/「上櫃」（無成分類型後綴）', () => {
  assert.deepEqual(parseEtfCategory('上市'), { market: 'TWSE', assetClass: null });
  assert.deepEqual(parseEtfCategory('上櫃'), { market: 'TPEx', assetClass: null });
});

test('parseEtfCategory: 無法辨識的格式回傳 null，不拋錯', () => {
  assert.equal(parseEtfCategory('興櫃'), null);
  assert.equal(parseEtfCategory(''), null);
});
