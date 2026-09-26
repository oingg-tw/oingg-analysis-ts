// 2026-09-25 股本列「股數與實收資本對不上」的判斷（MOPS 頁面本身兩格印得不一致，mops-ts 重抓原始 HTML 查明，
// 見 infrastructure/repositories/mops/capitalStock.ts）。錯位列 = 股數 ÷（資本÷面額）剛好 10^k、k≠0。
// 錯位不一定是股數欄錯：有時錯的是資本欄、股數其實對（6841 2025-06）。判斷方式是跟**前一筆一致列**比股數，
// ±50% 內算連貫、股數照用；否則跳過往更早找。只看前一筆不看後一筆——時間點查詢不能偷看未來。
// 沒有一致的前一筆就判斷不了，保守跳過（不猜）。
//
// 2026-09-26 疊上第二條、跟時間序列獨立的判準（mops-ts 提出）：**實收股數不可能超過核定股數**（公司法）。
// 股數與「實收資本 ÷ 面額」差超過 1% 的列，兩個候選值各自跟核定股數比——只有一邊合法就用那一邊（另一邊被法規排除），
// 兩邊都合法才退回上面的連貫性判斷。這條也涵蓋不是 10^k 的「其他比例」錯列（原本照用股數）。
// 用「資本 ÷ 面額」不是猜值：那是 MOPS 同一列另一格申報的數字。mops-ts 對 138 列的分類：股數可信 42、金額可信 51、
// 判別不出 45、都不通過 0（5512 2024-10：金額換算 7,663,124,940 股超過核定 1,010,000,000 股 7.6 倍，股數 766,312,494 才對）。
// 1% 容差：MOPS 的數字有四捨五入，完全相等會製造假不符。
const SHARES_CONTINUITY_MAX_RATIO = 1.5;
const CELL_MISMATCH_TOLERANCE = 0.01;

interface CapitalStockRow {
  paid_in_shares: bigint | null;
  misaligned: boolean;
  amount_shares: bigint | null; // 實收資本 ÷ 面額
  authorized_shares: bigint | null;
}

const legalVerdict = (row: CapitalStockRow): 'shares' | 'amount' | 'undecided' => {
  const { paid_in_shares: shares, amount_shares: amount, authorized_shares: authorized } = row;
  if (shares === null || amount === null || authorized === null || amount <= 0n) return 'undecided';
  if (Math.abs(Number(shares - amount)) <= CELL_MISMATCH_TOLERANCE * Number(amount)) return 'undecided';
  const sharesLegal = shares <= authorized;
  const amountLegal = amount <= authorized;
  if (sharesLegal && !amountLegal) return 'shares';
  if (!sharesLegal && amountLegal) return 'amount';
  return 'undecided';
};

// 2026-09-26 兩格都錯、方向相反（股數 ÷ 資本換算 恰為 100 或 1/100，mops-ts 稱 both_wrong_opposite）：真值是兩格的幾何中位
// （股數 ÷ 10 ＝ 資本換算 × 10）。原本一律跳過，代價是沿用增資前的舊股數——8171 2025-05 增資到約 1.13 億股，四列全是這種形狀，
// 跳過後用 2024-08 的 7,746 萬股，每股淨值高估 45%（交易所股價淨值比反推的每股淨值 ÷ 我們的 = 0.68 ≈ 77.46/112.85）。
// 幾何中位有兩個獨立旁證：6546、6861 跟前一筆一致列連貫；8171 跟交易所每股淨值吻合。仍要過核定上限與連貫性檢查。
const geometricMiddle = (row: CapitalStockRow): bigint | null => {
  const { paid_in_shares: shares, amount_shares: amount } = row;
  if (shares === null || amount === null || amount <= 0n) return null;
  const ratio = Number(shares) / Number(amount);
  if (Math.abs(ratio / 100 - 1) < 0.0005) return shares / 10n;
  if (Math.abs(ratio * 100 - 1) < 0.0005) return shares * 10n;
  return null;
};

export const pickPaidInSharesRow = <R extends CapitalStockRow>(rowsNewestFirst: R[]): { row: R; shares: bigint } | null => {
  for (let i = 0; i < rowsNewestFirst.length; i++) {
    const row = rowsNewestFirst[i]!;
    if (row.paid_in_shares === null) continue;
    const verdict = legalVerdict(row);
    if (!row.misaligned && verdict !== 'amount') return { row, shares: row.paid_in_shares };
    const middle = geometricMiddle(row);
    const legalMiddle = middle !== null && (row.authorized_shares === null || middle <= row.authorized_shares) ? middle : null;
    const candidate = legalMiddle ?? (verdict === 'amount' ? row.amount_shares! : row.paid_in_shares);
    const previousConsistent = rowsNewestFirst.slice(i + 1).find((r) => !r.misaligned && r.paid_in_shares !== null);
    if (previousConsistent) {
      // 2026-09-26 核定判準選出的那一格也要跟前一筆一致列連貫才採用：6546 2025-03 兩格都錯（股數 ×10 超過核定、資本格 ÷10），
      // 「只有金額合法」選了資本格，EPS 變 10 倍（近四季 27.32 vs 年報 2.73）。核定判準只能排除一邊，不保證另一邊對。
      const a = Number(candidate);
      const b = Number(previousConsistent.paid_in_shares);
      if (Math.max(a / b, b / a) <= SHARES_CONTINUITY_MAX_RATIO) return { row, shares: candidate };
      continue;
    }
    // 沒有前一筆一致列可比：只接受「股數合法、金額換算超過核定」（5512 2024-10，mops-ts 用原始文件印證）。
    // 錯位列（10^k）的「只有金額合法」不收——3131 2026-06 兩格都錯，資本格換算 2,925,893 股會讓 EPS 變 177。
    if (legalMiddle !== null) return { row, shares: legalMiddle };
    if (verdict === 'shares') return { row, shares: candidate };
    if (verdict === 'amount' && !row.misaligned) return { row, shares: candidate };
  }
  return null;
};
