import { expect, test } from 'vitest';
import { liabilityBreakdown, type LiabilityBreakdownInputs } from '@/domain/financials/liabilityBreakdown';

// 負債組成九項：守住三個恆等式（流動五項＝流動負債、非流動四項＝非流動負債），缺行當 0，非流動租賃抽取缺口給 null 不給 0。
const empty: LiabilityBreakdownInputs = {
  currentLiabilities: null, noncurrentLiabilities: null, shortTermBorrowings: null, shortTermNotesAndBillsPayable: null, accountsPayable: null,
  tradePayablesToRelatedParties: null, notesPayable: null, currentContractLiabilities: null, currentPortionOfLongTermLiabilities: null,
  longTermBorrowings: null, bondsPayable: null, currentLeaseLiabilities: null, noncurrentLeaseLiabilities: null,
};
const full: LiabilityBreakdownInputs = {
  ...empty,
  currentLiabilities: 1000n, noncurrentLiabilities: 600n,
  shortTermBorrowings: 100n, shortTermNotesAndBillsPayable: 20n, accountsPayable: 300n, tradePayablesToRelatedParties: 30n, notesPayable: 10n,
  currentContractLiabilities: 50n, currentPortionOfLongTermLiabilities: 40n, longTermBorrowings: 200n, bondsPayable: 150n,
  currentLeaseLiabilities: 15n, noncurrentLeaseLiabilities: 60n,
};

test('各項與推算的其他：流動五項＝流動負債、非流動四項＝非流動負債', () => {
  const r = liabilityBreakdown(full);
  expect(r).toEqual({
    shortTermBorrowings: 120n, accountsPayable: 340n, contractLiabilities: 50n, currentPortionOfLongTermDebt: 40n, otherCurrentLiabilities: 450n,
    longTermBorrowings: 200n, bondsPayable: 150n, leaseLiabilities: 60n, otherNonCurrentLiabilities: 190n,
  });
  expect(r.shortTermBorrowings! + r.accountsPayable! + r.contractLiabilities! + r.currentPortionOfLongTermDebt! + r.otherCurrentLiabilities!).toBe(1000n);
  expect(r.longTermBorrowings! + r.bondsPayable! + r.leaseLiabilities! + r.otherNonCurrentLiabilities!).toBe(600n);
});

test('個別科目缺行當 0（公司沒有那項負債）', () => {
  const r = liabilityBreakdown({ ...empty, currentLiabilities: 500n, noncurrentLiabilities: 80n, accountsPayable: 200n });
  expect(r.shortTermBorrowings).toBe(0n);
  expect(r.otherCurrentLiabilities).toBe(300n);
  expect(r.leaseLiabilities).toBe(0n); // 兩種租賃都沒有 → 沒有租賃
  expect(r.otherNonCurrentLiabilities).toBe(80n);
});

test('流動租賃有值、非流動租賃缺行 → 抽取缺口：租賃與其他非流動都給 null，不當 0', () => {
  const r = liabilityBreakdown({ ...full, noncurrentLeaseLiabilities: null });
  expect(r.leaseLiabilities).toBeNull();
  expect(r.otherNonCurrentLiabilities).toBeNull();
  expect(r.longTermBorrowings).toBe(200n); // 其他項照算
});

test('合計缺 → 那一邊全部 null', () => {
  const r = liabilityBreakdown({ ...full, currentLiabilities: null });
  expect(r.shortTermBorrowings).toBeNull();
  expect(r.otherCurrentLiabilities).toBeNull();
  expect(r.longTermBorrowings).toBe(200n);
});
