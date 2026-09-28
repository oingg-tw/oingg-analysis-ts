// 2026-09-28 盈餘發放率（年度口徑）的算術，股利歷史頁（application/companies/dividendHistory.ts 的 payoutRatio）與
// dividendPayoutRatio.FY 共用——同一個數字只算一種方法，兩邊不會各自漂移。
// 分子：該盈餘所屬年度各次分派的「盈餘分配」現金股利（元／股，不含法定盈餘公積與資本公積發放），逐次先四捨五入到分再加總；
// 分母：該年度年報的基本每股盈餘。EPS ≤ 0 或缺 EPS 時沒有意義，回 null（不硬算成負數）。
const round2 = (n: number): number => Math.round(n * 100) / 100;

export const cashDividendFromEarningsPerShare = (rows: { cashDividendFromEarnings: number | null }[]): number =>
  round2(rows.reduce((sum, row) => sum + round2(row.cashDividendFromEarnings ?? 0), 0));

export const earningsPayoutRatio = (cashDividendFromEarnings: number, eps: number | null): number | null =>
  eps !== null && eps > 0 ? round2((cashDividendFromEarnings / eps) * 100) : null;
