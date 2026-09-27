import { expect, test } from 'vitest';
import { breakDownBookValueChange, type AnnualEquityChange } from '@/domain/financials/bookValueBreakdown';

const year = (over: Partial<AnnualEquityChange> = {}): AnnualEquityChange => ({
  openingEquityThousands: 1_000_000,
  closingEquityThousands: 1_150_000,
  netIncomeThousands: 200_000,
  otherComprehensiveIncomeThousands: -10_000,
  commonCashDividendsThousands: -40_000,
  preferredCashDividendsThousands: 0,
  capitalIssuedThousands: 0,
  ...over,
});
const sum = (b: NonNullable<ReturnType<typeof breakDownBookValueChange>>) =>
  b.openingBvps + b.netIncome + b.otherComprehensiveIncome + b.cashDividends + b.capitalIssued + b.shareCountEffect + b.other;

test('股數不變：淨利 20、匯率 −1、股利 −4，對得上 → 其他 0，期初 100 → 期末 115', () => {
  const b = breakDownBookValueChange(year(), { opening: 0, closing: 0 }, { opening: 10_000_000, closing: 10_000_000 })!;
  expect(b).toEqual({ openingBvps: 100, netIncome: 20, otherComprehensiveIncome: -1, cashDividends: -4, capitalIssued: 0, shareCountEffect: 0, other: 0, closingBvps: 115 });
});

test('現金增資 2 成、每股 50 元發行（低於淨值）：增資是正、股數稀釋是負，期初＋各項＝期末', () => {
  const b = breakDownBookValueChange(
    year({ closingEquityThousands: 1_250_000, capitalIssuedThousands: 100_000, otherComprehensiveIncomeThousands: 0, commonCashDividendsThousands: -50_000 }),
    { opening: 0, closing: 0 },
    { opening: 10_000_000, closing: 12_000_000 }
  )!;
  expect(b.capitalIssued).toBeCloseTo(8.33);
  expect(b.shareCountEffect).toBeCloseTo(-16.67);
  expect(Math.abs(b.other)).toBeLessThanOrEqual(0.01); // 只剩四捨五入差額
  expect(Math.round(sum(b) * 100)).toBe(Math.round(b.closingBvps * 100));
});

test('普通股口徑：扣特別股股本、淨利扣特別股股利（跟 bvps 一致）', () => {
  const b = breakDownBookValueChange(year({ preferredCashDividendsThousands: -5_000 }), { opening: 100_000, closing: 100_000 }, { opening: 10_000_000, closing: 10_000_000 })!;
  expect(b.openingBvps).toBe(90);
  expect(b.netIncome).toBe(19.5);
  expect(b.closingBvps).toBe(105);
});

test('股數缺 → null（不猜）', () => {
  expect(breakDownBookValueChange(year(), { opening: 0, closing: 0 }, { opening: 0, closing: 10 })).toBeNull();
});

test('四捨五入差額由「其他」吸收：期初 + 各項 = 期末 到分精確成立（bff-ts 量到舊版 197 列有 37 列差 0.01~0.02）', () => {
  const b = breakDownBookValueChange(
    year({ openingEquityThousands: 1_000_003, closingEquityThousands: 1_150_007, netIncomeThousands: 200_004, otherComprehensiveIncomeThousands: -10_004, commonCashDividendsThousands: -40_004 }),
    { opening: 0, closing: 0 },
    { opening: 10_000_000, closing: 10_000_700 }
  )!;
  expect(Math.round(sum(b) * 100)).toBe(Math.round(b.closingBvps * 100));
});
