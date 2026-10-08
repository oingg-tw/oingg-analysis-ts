// 2026-10-08 銀行業的營收／毛利／營業利益（使用者：券商軟體金融股也有營收、毛利，要算）。銀行損益表沒有「營業收入 − 營業成本」，
// 公式是用使用者給的券商軟體數字反推、兩個比率都吻合的口徑（2838 聯邦銀 115Q2：毛利率 55.28%、淨利率 20.72%）：
//   營收     = 利息收入總額 ＋ 非利息淨收益（利息用總額、其餘用淨額）
//   毛利     = 營收 − 利息費用 − 呆帳費用及保證責任準備 ＝ 利息淨收益 ＋ 非利息淨收益 − 呆帳（資金成本與放款損失當成銀行的營業成本）
//   營業利益 = 稅前淨利 − 透過其他綜合損益按公允價值衡量之金融資產已實現損益 − 除列按攤銷後成本衡量之金融資產損益
//             （處分「收息用」債券投資的已實現損益有一次性性質，券商算業外；交易部位（透過損益按公允價值衡量）的損益仍算本業）
//   2026-10-09 營業利益用使用者給的 3 家券商營益率反推確認：2838 22.8%、2834 21.58%、2801 22.48% 都吻合
//   （原本只用稅前淨利，2838 算出 23.86%，對不上）。
// 只適用純銀行（銀行損益表明細查得到的公司）；金控、保險的損益表結構不同，等有券商軟體數字驗證再另做。
// 被否決的替代：營收只用淨收益（毛利率會恆為 100%，對不上券商軟體）；毛利只扣利息費用不扣呆帳（2838 算出 65.47%，對不上 55.28%）。
export interface BankIncomeInputs {
  interestIncome: bigint | null; // 利息收入總額（一般損益表 revenue_from_interest；對銀行就是利息收入，不是業外利息）
  netInterestIncome: bigint | null; // 利息淨收益
  netNonInterestIncome: bigint | null; // 非利息淨收益
  badDebtProvision: bigint | null; // 呆帳費用及保證責任準備
  profitBeforeTax: bigint | null;
  fvociRealizedGain: bigint | null; // 透過其他綜合損益按公允價值衡量之金融資產已實現損益
  amortisedCostDerecognitionGain: bigint | null; // 除列按攤銷後成本衡量之金融資產損益
}

export interface BankIncomeAsGeneral {
  revenue: bigint;
  grossProfit: bigint;
  operatingIncome: bigint | null;
}

export const bankIncomeAsGeneral = (inputs: BankIncomeInputs): BankIncomeAsGeneral | null => {
  const { interestIncome, netInterestIncome, netNonInterestIncome, badDebtProvision, profitBeforeTax, fvociRealizedGain, amortisedCostDerecognitionGain } = inputs;
  if (interestIncome === null || netInterestIncome === null || netNonInterestIncome === null || badDebtProvision === null) return null;
  return {
    revenue: interestIncome + netNonInterestIncome,
    grossProfit: netInterestIncome + netNonInterestIncome - badDebtProvision,
    // ponytail: 兩個扣除項缺行（XBRL 沒有那一行）當 0——沒有處分就不會揭露，2838 的除列損益就是缺行；若遇到「其實有處分但漏抓」會高估營業利益，要再收緊就比對 net_other_non_interest 小計。
    operatingIncome: profitBeforeTax === null ? null : profitBeforeTax - (fvociRealizedGain ?? 0n) - (amortisedCostDerecognitionGain ?? 0n),
  };
};
