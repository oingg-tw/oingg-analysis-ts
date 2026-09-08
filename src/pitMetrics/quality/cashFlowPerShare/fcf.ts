// FCF（自由現金流）= 營業活動現金流 + 資本支出——資本支出來源資料是負值/流出，用加法
// 不是減法。不是獨立 metricCode，是 fcfPerShare 的中繼計算。
export const calculateFcf = (operatingCashFlow: bigint | null, capitalExpenditures: bigint | null): bigint | null =>
  operatingCashFlow !== null && capitalExpenditures !== null ? operatingCashFlow + capitalExpenditures : null;
