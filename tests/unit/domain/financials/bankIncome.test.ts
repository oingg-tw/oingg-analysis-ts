import { expect, test } from 'vitest';
import { bankIncomeAsGeneral } from '@/domain/financials/bankIncome';
import { calculateGrossMargin } from '@/domain/metrics/profitability/grossMargin/calculateGrossMargin';
import { calculateNetProfitMargin } from '@/domain/metrics/profitability/netProfitMargin/calculateNetProfitMargin';
import { calculateOperatingMargin } from '@/domain/metrics/profitability/operatingMargin/calculateOperatingMargin';

// 釘住券商軟體的對照值：2838 聯邦銀 115Q2 單季（千元），使用者提供毛利率 55.28%、淨利率 20.72%。
const bank2838 = { interestIncome: 6193510n, netInterestIncome: 2681816n, netNonInterestIncome: 3977763n, badDebtProvision: 1036765n, profitBeforeTax: 2427328n };
const netIncome2838 = 2107119n;

test('2838 115Q2：毛利率、淨利率對得上券商軟體', () => {
  const r = bankIncomeAsGeneral(bank2838)!;
  expect(r.revenue).toBe(10171273n);
  expect(r.grossProfit).toBe(5622814n);
  expect(calculateGrossMargin(r.grossProfit, r.revenue).value).toBe(55.28);
  expect(calculateNetProfitMargin(netIncome2838, r.revenue).value).toBe(20.72);
  expect(calculateOperatingMargin(r.operatingIncome, r.revenue).value).toBe(23.86);
});

test('缺任何一個構成項目就不算（不拿 0 頂替）', () => {
  expect(bankIncomeAsGeneral({ ...bank2838, badDebtProvision: null })).toBeNull();
  expect(bankIncomeAsGeneral({ ...bank2838, interestIncome: null })).toBeNull();
  expect(bankIncomeAsGeneral({ ...bank2838, profitBeforeTax: null })?.operatingIncome).toBeNull();
});
