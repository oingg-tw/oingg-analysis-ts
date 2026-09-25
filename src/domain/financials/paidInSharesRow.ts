// 2026-09-25 股本列「股數與實收資本對不上」的判斷（MOPS 頁面本身兩格印得不一致，mops-ts 重抓原始 HTML 查明，
// 見 infrastructure/repositories/mops/capitalStock.ts）。錯位列 = 股數 ÷（資本÷面額）剛好 10^k、k≠0。
// 錯位不一定是股數欄錯：有時錯的是資本欄、股數其實對（6841 2025-06）。判斷方式是跟**前一筆一致列**比股數，
// ±50% 內算連貫、股數照用；否則跳過往更早找。只看前一筆不看後一筆——時間點查詢不能偷看未來。
// 沒有一致的前一筆就判斷不了，保守跳過（不猜）。
const SHARES_CONTINUITY_MAX_RATIO = 1.5;

export const pickPaidInSharesRow = <R extends { paid_in_shares: bigint | null; misaligned: boolean }>(rowsNewestFirst: R[]): R | null => {
  for (let i = 0; i < rowsNewestFirst.length; i++) {
    const row = rowsNewestFirst[i]!;
    if (row.paid_in_shares === null) continue;
    if (!row.misaligned) return row;
    const previousConsistent = rowsNewestFirst.slice(i + 1).find((r) => !r.misaligned && r.paid_in_shares !== null);
    if (previousConsistent) {
      const a = Number(row.paid_in_shares);
      const b = Number(previousConsistent.paid_in_shares);
      if (Math.max(a / b, b / a) <= SHARES_CONTINUITY_MAX_RATIO) return row;
    }
  }
  return null;
};
