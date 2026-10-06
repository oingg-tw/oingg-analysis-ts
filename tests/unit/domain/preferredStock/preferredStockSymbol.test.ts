import { describe, expect, test } from 'vitest';
import { PREFERRED_STOCK_SYMBOL_PATTERN } from '@/domain/preferredStock/preferredStockSymbol';

// 2026-10-06：釘住特別股代號規則——2887Z1 要抓到、換股權利證書（R～Z 單一字母）與 ETF／一般股要排除。
const re = new RegExp(PREFERRED_STOCK_SYMBOL_PATTERN);

describe('PREFERRED_STOCK_SYMBOL_PATTERN', () => {
  test.each(['1312A', '2881C', '2887I', '2887Z1', '8349A'])('特別股 %s', (symbol) => expect(re.test(symbol)).toBe(true));
  test.each(['2330', '1605Y', '2332X', '3045R', '2418W', '00981A', '00631L', '01001T', '2887Z12'])('不是特別股 %s', (symbol) => expect(re.test(symbol)).toBe(false));
});
