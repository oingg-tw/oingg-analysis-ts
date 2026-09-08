// EBIT = 稅前淨利 + 財務費用——五因子 Extended DuPont 的共用中繼值（dupontInterestBurden/
// dupontEbitMargin 都要用到），跟 roic/roce/interestCoverage/netDebtToEbitda/evEbitda
// 已經在用的定義一致。不是獨立 metricCode，是 computeDupontFamilyPit.ts 編排層的中繼計算，
// 所以留在這裡，不是拆進 pitMetrics/<分類>/<指標>/ 的對象。
export const calculateEbit = (profitBeforeTax: bigint | null, financeCosts: bigint | null): bigint | null =>
  profitBeforeTax !== null && financeCosts !== null ? profitBeforeTax + financeCosts : null;
