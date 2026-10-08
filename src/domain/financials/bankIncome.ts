// 2026-10-08 銀行業的營收／毛利／營業利益（使用者：券商軟體金融股也有營收、毛利，要算）。銀行損益表沒有「營業收入 − 營業成本」，
// 公式是用使用者給的券商軟體數字反推、兩個比率都吻合的口徑（2838 聯邦銀 115Q2：毛利率 55.28%、淨利率 20.72%）：
//   營收     = 利息收入總額 ＋ 非利息淨收益（利息用總額、其餘用淨額）
//   毛利     = 營收 − 利息費用 − 呆帳費用及保證責任準備 ＝ 利息淨收益 ＋ 非利息淨收益 − 呆帳（資金成本與放款損失當成銀行的營業成本）
//   營業利益 = 稅前淨利（銀行損益表沒有業外收支，稅前淨利就是毛利 − 營業費用；2838 115Q2 精確相等）
// 只適用純銀行（銀行損益表明細查得到的公司）；金控、保險的損益表結構不同，等有券商軟體數字驗證再另做。
// 被否決的替代：營收只用淨收益（毛利率會恆為 100%，對不上券商軟體）；毛利只扣利息費用不扣呆帳（2838 算出 65.47%，對不上 55.28%）。
export interface BankIncomeInputs {
  interestIncome: bigint | null; // 利息收入總額（一般損益表 revenue_from_interest；對銀行就是利息收入，不是業外利息）
  netInterestIncome: bigint | null; // 利息淨收益
  netNonInterestIncome: bigint | null; // 非利息淨收益
  badDebtProvision: bigint | null; // 呆帳費用及保證責任準備
  profitBeforeTax: bigint | null;
}

export interface BankIncomeAsGeneral {
  revenue: bigint;
  grossProfit: bigint;
  operatingIncome: bigint | null;
}

export const bankIncomeAsGeneral = (inputs: BankIncomeInputs): BankIncomeAsGeneral | null => {
  const { interestIncome, netInterestIncome, netNonInterestIncome, badDebtProvision, profitBeforeTax } = inputs;
  if (interestIncome === null || netInterestIncome === null || netNonInterestIncome === null || badDebtProvision === null) return null;
  return {
    revenue: interestIncome + netNonInterestIncome,
    grossProfit: netInterestIncome + netNonInterestIncome - badDebtProvision,
    operatingIncome: profitBeforeTax,
  };
};
