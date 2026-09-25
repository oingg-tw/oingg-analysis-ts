import { expect, test } from 'vitest';
import { pickPaidInSharesRow } from '@/domain/financials/paidInSharesRow';

const row = (shares: number, misaligned = false) => ({ paid_in_shares: BigInt(shares), misaligned });

test('最新一筆一致 → 用它', () => {
  expect(pickPaidInSharesRow([row(100), row(90)])?.paid_in_shares).toBe(100n);
});

test('最新一筆錯位、股數跟前一筆差 10 倍 → 跳過，用前一筆', () => {
  expect(pickPaidInSharesRow([row(1000, true), row(100)])?.paid_in_shares).toBe(100n);
});

test('最新一筆錯位、股數跟前一筆連貫（±50% 內）→ 股數照用', () => {
  expect(pickPaidInSharesRow([row(95, true), row(97)])?.paid_in_shares).toBe(95n);
});

test('錯位列沒有一致的前一筆 → null（不猜）', () => {
  expect(pickPaidInSharesRow([row(1000, true)])).toBeNull();
  expect(pickPaidInSharesRow([row(1000, true), row(1001, true)])).toBeNull();
});
