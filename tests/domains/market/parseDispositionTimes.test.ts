import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDispositionTimes } from '@/domains/market/disposedStocks/parseReasonTimes';

test('parseDispositionTimes: null 回傳 null', () => {
  assert.equal(parseDispositionTimes(null), null);
});

test('parseDispositionTimes: 中文數字「連續N次」', () => {
  assert.equal(parseDispositionTimes('連續五次'), 5);
  assert.equal(parseDispositionTimes('連續三次'), 3);
});

test('parseDispositionTimes: 阿拉伯數字「連續N個營業日」', () => {
  assert.equal(parseDispositionTimes('連續5個營業日'), 5);
  assert.equal(parseDispositionTimes('連續3個營業日及沖銷標準'), 3);
});

test('parseDispositionTimes: 前後夾雜法條引用文字，仍要找得到子字串', () => {
  assert.equal(parseDispositionTimes('因連續3個營業日達本中心作業要點第四條第一項第一款'), 3);
});

test('parseDispositionTimes: 「最近N個營業日內有M個營業日」取 M（達標次數），不是 N（觀察窗口）', () => {
  assert.equal(parseDispositionTimes('最近10個營業日內有6個營業日'), 6);
});

test('parseDispositionTimes: 完全沒有次數概念的處置原因回傳 null，不拋錯', () => {
  assert.equal(parseDispositionTimes('轉(交)換公司債之標的證券經本中心或臺灣證券交易所發布處置'), null);
});
