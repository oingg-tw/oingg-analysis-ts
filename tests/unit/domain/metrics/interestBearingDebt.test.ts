import { expect, test } from 'vitest';
import { interestBearingDebt } from '@/domain/metrics/shared/pickers';
import { sAndPAdjustedDebt } from '@/application/metrics/resilience/netDebtToEbitda/computeNetDebtToEbitda';

// 2026-09-28 有息負債補齊：1301 台塑 115Q2（千元）。
const bs1301 = {
  shortTermBorrowings: 44322236n,
  shortTermNotesAndBillsPayable: 23979650n,
  currentPortionOfLongTermLiabilities: 12871487n,
  bondsPayable: 36805986n,
  longTermBorrowings: 15714642n,
  currentLeaseLiabilities: 147383n,
  noncurrentLeaseLiabilities: 2470691n,
  netDefinedBenefitLiability: 2135210n,
};

test('有息負債 = 短期借款＋應付短期票券＋一年內到期長期負債＋非流動公司債＋長期借款', () => {
  expect(interestBearingDebt(bs1301)).toBe(133694001n);
  // 缺欄位視為 0（跟既有三項同一慣例）
  expect(interestBearingDebt({ shortTermBorrowings: 10n, bondsPayable: null, longTermBorrowings: 5n })).toBe(15n);
});

test('S&P 調整後負債 = 有息負債＋租賃負債＋淨確定福利負債 × 0.8', () => {
  expect(sAndPAdjustedDebt(bs1301 as never)).toBe(133694001n + 147383n + 2470691n + 1708168n);
});
