import { expect, test } from 'vitest';
import { twseDividendYield } from '@/domain/market/twseDividendYield';

// 2026-09-30：證交所 8/28 起沒配息寫空白——之後的 null 當 0，之前的 null（真的沒公布）照舊 null，有值不動。
test('上市殖利率空白：2026-08-28 起當 0，之前維持 null', () => {
  expect(twseDividendYield(null, new Date('2026-08-28'))).toBe(0);
  expect(twseDividendYield(null, new Date('2026-09-29'))).toBe(0);
  expect(twseDividendYield(null, new Date('2026-08-27'))).toBeNull();
  expect(twseDividendYield(3.21, new Date('2026-09-29'))).toBe(3.21);
  expect(twseDividendYield(0, new Date('2026-08-26'))).toBe(0);
});
