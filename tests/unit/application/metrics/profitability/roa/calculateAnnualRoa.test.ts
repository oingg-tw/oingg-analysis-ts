import { expect, test } from 'vitest';
import { calculateAnnualRoa } from '@/application/metrics/profitability/roa/computeRoa';

// 2026-10-05 ROA 年度版＝〔本期淨利＋財務成本×(1−20%)〕÷((年初＋年底總資產)/2)，口徑用 MOPS 財務分析校準（見 computeRoa.ts）。
test('淨利為負、加回稅後財務成本後轉正（2002 中鋼 114 年度的形狀：ROE 負、ROA 正）', () => {
  expect(calculateAnnualRoa(-100n, 200n, 9_000n, 11_000n)).toEqual({ value: 0.6, nullReason: null }); // (−100 + 160) / 10,000
});

test('沒有財務成本當 0；缺年初資產是 insufficient_history、缺淨利或年底資產是 missing_input', () => {
  expect(calculateAnnualRoa(500n, null, 10_000n, 10_000n).value).toBe(5);
  expect(calculateAnnualRoa(500n, 0n, null, 10_000n).nullReason).toBe('insufficient_history');
  expect(calculateAnnualRoa(null, 0n, 10_000n, 10_000n).nullReason).toBe('missing_input');
});
