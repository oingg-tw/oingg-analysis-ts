import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDispositionTimes, parseReasonShortLabel, parseDispositionPeriod } from '@/domains/market/disposedStocks/parseReason';

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

test('parseReasonShortLabel: 引用第一款到第十三款都能對到正確標籤', () => {
  assert.equal(parseReasonShortLabel('因連續3個營業日達本中心作業要點第四條第一項第一款'), '漲跌異常');
  assert.equal(parseReasonShortLabel('因連續3個營業日達本中心作業要點第四條第一項第十三款'), '當沖比率異常');
  assert.equal(parseReasonShortLabel('因連續3個營業日達本中心作業要點第四條第一項第十款'), '週轉率異常');
});

test('parseReasonShortLabel: 可轉換公司債標的證券是獨立分類，不套用款次對照表', () => {
  assert.equal(parseReasonShortLabel('轉(交)換公司債之標的證券經本中心或臺灣證券交易所發布處置'), '轉(交)換公司債');
});

test('parseReasonShortLabel: 沒有款次引用但有「沖銷」關鍵字，仍對到當沖比率異常', () => {
  assert.equal(parseReasonShortLabel('連續3個營業日及沖銷標準'), '當沖比率異常');
});

test('parseReasonShortLabel: 純「連續N次」沒有任何款次或關鍵字時回傳 null，不亂猜', () => {
  assert.equal(parseReasonShortLabel('連續五次'), null);
  assert.equal(parseReasonShortLabel('連續5個營業日'), null);
});

test('parseReasonShortLabel: null 回傳 null', () => {
  assert.equal(parseReasonShortLabel(null), null);
});

test('parseDispositionPeriod: TWSE 斜線格式（全形波浪號）', () => {
  assert.deepEqual(parseDispositionPeriod('115/08/27～115/09/02'), { startDate: '2026-08-27', endDate: '2026-09-02' });
});

test('parseDispositionPeriod: TPEx 緊湊格式（半形波浪號）', () => {
  assert.deepEqual(parseDispositionPeriod('1150827~1150902'), { startDate: '2026-08-27', endDate: '2026-09-02' });
});

test('parseDispositionPeriod: null 或無法解析回傳 null', () => {
  assert.equal(parseDispositionPeriod(null), null);
  assert.equal(parseDispositionPeriod('不是日期格式'), null);
});
