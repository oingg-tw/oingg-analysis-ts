import { expect, test } from 'vitest';
import { bankIncomeAsGeneral, type BankIncomeInputs } from '@/domain/financials/bankIncome';
import { calculateGrossMargin } from '@/domain/metrics/profitability/grossMargin/calculateGrossMargin';
import { calculateNetProfitMargin } from '@/domain/metrics/profitability/netProfitMargin/calculateNetProfitMargin';
import { calculateOperatingMargin } from '@/domain/metrics/profitability/operatingMargin/calculateOperatingMargin';

// 釘住券商軟體的對照值（115Q2 單季、千元），數字是使用者在券商軟體上看到的：
// 2838 聯邦銀 毛利率 55.28%、營益率 22.8%、淨利率 20.72%；2834 臺企銀 營益率 21.58%；2801 彰銀 營益率 22.48%。
const bank2838: BankIncomeInputs = {
  interestIncome: 6193510n,
  netInterestIncome: 2681816n,
  netNonInterestIncome: 3977763n,
  badDebtProvision: 1036765n,
  profitBeforeTax: 2427328n,
  fvociRealizedGain: 108094n,
  amortisedCostDerecognitionGain: null, // XBRL 沒有這一行（這季沒有處分）
};
const netIncome2838 = 2107119n; // 合併淨利（含少數股東），券商的淨利率用這個

test('2838 115Q2：毛利率、營益率、淨利率對得上券商軟體', () => {
  const r = bankIncomeAsGeneral(bank2838)!;
  expect(r.revenue).toBe(10171273n);
  expect(r.grossProfit).toBe(5622814n);
  expect(calculateGrossMargin(r.grossProfit, r.revenue).value).toBe(55.28);
  expect(calculateNetProfitMargin(netIncome2838, r.revenue).value).toBe(20.72);
  // 營業利益 = 稅前淨利 − FVOCI 已實現損益 − 攤銷後成本除列損益；只扣稅前淨利會是 23.86%，對不上券商的 22.8%。
  expect(calculateOperatingMargin(r.operatingIncome, r.revenue).value).toBe(22.8);
});

test('2801、2834 115Q2：營益率對得上券商軟體（兩個扣除項都有值的情況）', () => {
  const r2801 = bankIncomeAsGeneral({ interestIncome: 20659124n, netInterestIncome: 7802596n, netNonInterestIncome: 5620913n, badDebtProvision: 790953n, profitBeforeTax: 6899599n, fvociRealizedGain: 976816n, amortisedCostDerecognitionGain: 13760n })!;
  expect(calculateOperatingMargin(r2801.operatingIncome, r2801.revenue).value).toBe(22.48);
  const r2834 = bankIncomeAsGeneral({ interestIncome: 15171273n, netInterestIncome: 5683260n, netNonInterestIncome: 3990406n, badDebtProvision: 611745n, profitBeforeTax: 4614291n, fvociRealizedGain: 478574n, amortisedCostDerecognitionGain: 38n })!;
  expect(calculateOperatingMargin(r2834.operatingIncome, r2834.revenue).value).toBe(21.58);
});

test('缺營收或毛利的構成項目就不算（不拿 0 頂替）；稅前淨利缺就沒有營業利益', () => {
  expect(bankIncomeAsGeneral({ ...bank2838, badDebtProvision: null })).toBeNull();
  expect(bankIncomeAsGeneral({ ...bank2838, interestIncome: null })).toBeNull();
  expect(bankIncomeAsGeneral({ ...bank2838, profitBeforeTax: null })?.operatingIncome).toBeNull();
});
