// 2026-10-09 負債組成九項（web-nuxt 負債組成頁、使用者選「逐科目」）：流動五項相加＝流動負債、非流動四項相加＝非流動負債，
// 九項相加＝負債總計（流動＋非流動＝負債總計，108Q3～115Q2 非金融業實測 0 筆不等）。
// - 個別科目缺行當 0：公司沒有這項負債就不會申報那一行。108Q3～115Q2 各科目覆蓋率每季穩定（短期借款約 75%、長期借款約 65%、
//   合約負債約 75%、公司債約 19%），符合「很多公司本來就沒有」，不是抽取缺口。
// - 兩個「其他」是合計減掉列出的各項推算出來的（XBRL 沒有單一對應科目）；實測推算值為負 0 筆，表示各項之間沒有重複計算。
// - 租賃負債例外：「流動租賃有值、非流動租賃缺行」當成資料缺口給 null（不當 0，否則租賃會被算進其他非流動負債、看起來合理其實錯），
//   其他非流動負債連帶 null；兩種租賃都沒有 → 公司沒有租賃，給 0。起因是 115 年以前非流動租賃放在另一個 XBRL 元素
//   （repository 已合併兩欄，見 balanceSheetXbrlFirst.ts），合併後這條很少觸發，留著防下一次元素改名。
// - 應付帳款含應付票據與關係人（使用者 10/09：照台灣財報「應付票據及帳款」的分組）。
export interface LiabilityBreakdownInputs {
  currentLiabilities: bigint | null;
  noncurrentLiabilities: bigint | null;
  shortTermBorrowings: bigint | null;
  shortTermNotesAndBillsPayable: bigint | null;
  accountsPayable: bigint | null;
  tradePayablesToRelatedParties: bigint | null;
  notesPayable: bigint | null;
  currentContractLiabilities: bigint | null;
  currentPortionOfLongTermLiabilities: bigint | null;
  longTermBorrowings: bigint | null;
  bondsPayable: bigint | null;
  currentLeaseLiabilities: bigint | null;
  noncurrentLeaseLiabilities: bigint | null;
}

export interface LiabilityBreakdown {
  shortTermBorrowings: bigint | null;
  accountsPayable: bigint | null;
  contractLiabilities: bigint | null;
  currentPortionOfLongTermDebt: bigint | null;
  otherCurrentLiabilities: bigint | null;
  longTermBorrowings: bigint | null;
  bondsPayable: bigint | null;
  leaseLiabilities: bigint | null;
  otherNonCurrentLiabilities: bigint | null;
}

const sum = (...values: (bigint | null)[]): bigint => values.reduce<bigint>((total, v) => total + (v ?? 0n), 0n);

export const liabilityBreakdown = (bs: LiabilityBreakdownInputs): LiabilityBreakdown => {
  const current = bs.currentLiabilities;
  const shortTermBorrowings = current === null ? null : sum(bs.shortTermBorrowings, bs.shortTermNotesAndBillsPayable);
  const accountsPayable = current === null ? null : sum(bs.accountsPayable, bs.tradePayablesToRelatedParties, bs.notesPayable);
  const contractLiabilities = current === null ? null : sum(bs.currentContractLiabilities);
  const currentPortionOfLongTermDebt = current === null ? null : sum(bs.currentPortionOfLongTermLiabilities);
  const otherCurrentLiabilities = current === null ? null : current - shortTermBorrowings! - accountsPayable! - contractLiabilities! - currentPortionOfLongTermDebt!;

  const nonCurrent = bs.noncurrentLiabilities;
  const longTermBorrowings = nonCurrent === null ? null : sum(bs.longTermBorrowings);
  const bondsPayable = nonCurrent === null ? null : sum(bs.bondsPayable);
  const leaseLiabilities = nonCurrent === null ? null : (bs.noncurrentLeaseLiabilities ?? (bs.currentLeaseLiabilities !== null ? null : 0n));
  const otherNonCurrentLiabilities = nonCurrent === null || leaseLiabilities === null ? null : nonCurrent - longTermBorrowings! - bondsPayable! - leaseLiabilities;

  return { shortTermBorrowings, accountsPayable, contractLiabilities, currentPortionOfLongTermDebt, otherCurrentLiabilities, longTermBorrowings, bondsPayable, leaseLiabilities, otherNonCurrentLiabilities };
};
