import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDistributionFrequency } from '@/domains/market/etfRanking/parseDistribution';

test('parseDistributionFrequency: null 回傳 null', () => {
  assert.equal(parseDistributionFrequency(null), null);
});

test('parseDistributionFrequency: 各種配息頻率都能正確拆出來', () => {
  assert.equal(parseDistributionFrequency('不分級別/分配(月配)'), '月配');
  assert.equal(parseDistributionFrequency('其他級別/分配(季配)'), '季配');
  assert.equal(parseDistributionFrequency('不分級別/分配(半年配)'), '半年配');
  assert.equal(parseDistributionFrequency('不分級別/分配(年配)'), '年配');
  assert.equal(parseDistributionFrequency('不分級別/分配(一年兩次配息)'), '一年兩次配息');
  assert.equal(parseDistributionFrequency('不分級別/分配(其他)'), '其他');
});

test('parseDistributionFrequency: 不分配的兩種級別都統一回傳「不分配」', () => {
  assert.equal(parseDistributionFrequency('不分級別/不分配'), '不分配');
  assert.equal(parseDistributionFrequency('其他級別/不分配'), '不分配');
});

test('parseDistributionFrequency: 無法辨識的格式回傳 null，不拋錯', () => {
  assert.equal(parseDistributionFrequency('看不懂的格式'), null);
  assert.equal(parseDistributionFrequency(''), null);
});
