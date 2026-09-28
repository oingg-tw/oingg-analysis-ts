import { expect, test } from 'vitest';
import { fillAbsentOperatingExpenseComponents } from '@/domain/financials/operatingExpenseComponents';

const row = (o: Partial<Record<string, bigint | null>>) => ({ operatingExpense: null, sellingExpenses: null, adminExpenses: null, researchAndDevelopmentExpense: null, expectedCreditLoss: null, ...o });

test('恆等式成立：缺的那一行當 0（6873 114Q4 單季）', () => {
  const r = fillAbsentOperatingExpenseComponents(row({ operatingExpense: 297184n, sellingExpenses: 46920n, adminExpenses: 223715n, researchAndDevelopmentExpense: 26549n }));
  expect(r.expectedCreditLoss).toBe(0n);
});

test('對不上（mops 114Q4 漏抓減損那一行，4142）：維持 null，不安靜變 0', () => {
  const r = fillAbsentOperatingExpenseComponents(row({ operatingExpense: 195522n, sellingExpenses: 18246n, adminExpenses: 74891n, researchAndDevelopmentExpense: 74681n }));
  expect(r.expectedCreditLoss).toBeNull();
});

test('差 1 千元以內（進位）仍當 0；沒有營業費用合計或四項全缺都不動', () => {
  expect(fillAbsentOperatingExpenseComponents(row({ operatingExpense: 101n, sellingExpenses: 60n, adminExpenses: 40n })).researchAndDevelopmentExpense).toBe(0n);
  expect(fillAbsentOperatingExpenseComponents(row({ sellingExpenses: 60n })).adminExpenses).toBeNull();
  expect(fillAbsentOperatingExpenseComponents(row({ operatingExpense: 100n })).sellingExpenses).toBeNull();
});
