import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';

export const FOREIGN_NET_BUY_DAYS = 20;

// 近 20 個交易日外資買賣超股數合計 ÷ 流通在外普通股 × 100（使用者 2026-10-07 選「佔發行股數 %」，大型股、小型股才放得在一起比）。
// 數字通常在 ±1% 以內，留 4 位小數（2 位會把大型股壓成 0.00）。
// tradeDays：窗口內的交易日數（全市場的，不是這檔有列的天數）；不足 20 天 → insufficient_history（2026-09-01 起才有資料）。
export const calculateForeignNetBuy20d = (netBuySharesSum: bigint, tradeDays: number, outstandingShares: number | null): CalcResult => {
  if (tradeDays < FOREIGN_NET_BUY_DAYS) return { value: null, nullReason: 'insufficient_history' };
  if (outstandingShares === null) return { value: null, nullReason: 'missing_input' };
  if (outstandingShares <= 0) return { value: null, nullReason: 'zero_or_negative_denominator' };
  return { value: Math.round((Number(netBuySharesSum) / outstandingShares) * 100 * 10_000) / 10_000, nullReason: null };
};
