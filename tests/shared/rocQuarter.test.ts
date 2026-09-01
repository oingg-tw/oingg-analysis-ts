import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatRocYearSeasonAsOfDate } from '@/shared/rocQuarter';

describe('formatRocYearSeasonAsOfDate', () => {
  test('民國 115 年 Q2 -> 西元 2026 -> "26Q2"', () => {
    assert.equal(formatRocYearSeasonAsOfDate(115, 2), '26Q2');
  });

  test('跨十年的情況：民國 119 年 Q4 -> 西元 2030 -> "30Q4"', () => {
    assert.equal(formatRocYearSeasonAsOfDate(119, 4), '30Q4');
  });

  test('民國 100 年 Q1 -> 西元 2011 -> "11Q1"', () => {
    assert.equal(formatRocYearSeasonAsOfDate(100, 1), '11Q1');
  });
});
