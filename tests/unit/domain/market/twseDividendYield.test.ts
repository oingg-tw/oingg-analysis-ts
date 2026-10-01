import { expect, test } from 'vitest';
import { twseDividendYield } from '@/domain/market/twseDividendYield';

test('上市殖利率空白＝沒配息，一律當 0；有值照原值', () => {
  expect(twseDividendYield(null)).toBe(0);
  expect(twseDividendYield(3.21)).toBe(3.21);
  expect(twseDividendYield(0)).toBe(0);
});
