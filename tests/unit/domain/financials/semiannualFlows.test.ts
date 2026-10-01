import { expect, test } from 'vitest';
import { subtractCumulative } from '@/domain/financials/semiannualFlows';

const d = new Date('2025-12-31');
test('下半年 = 年報累計 − Q2 累計：逐欄位相減、任一邊 null 就 null、非數字欄位取較晚那份', () => {
  const later = { reportDate: d, revenue: 1000n as bigint | null, netIncome: 300n as bigint | null, cost: null as bigint | null, tag: 'x' };
  const earlier = { reportDate: new Date('2025-06-30'), revenue: 400n as bigint | null, netIncome: null as bigint | null, cost: 50n as bigint | null, tag: 'y' };
  expect(subtractCumulative(later, earlier)).toEqual({ reportDate: d, revenue: 600n, netIncome: null, cost: null, tag: 'x' });
});

test('「null 代表沒發生」的欄位當 0 相減：上半年沒配股利、全年配 −50 → 下半年 −50', () => {
  const later = { reportDate: d, dividendsPaid: -50n as bigint | null };
  const earlier = { reportDate: d, dividendsPaid: null as bigint | null };
  expect(subtractCumulative(later, earlier, ['dividendsPaid']).dividendsPaid).toBe(-50n);
  expect(subtractCumulative(later, earlier).dividendsPaid).toBeNull();
});
