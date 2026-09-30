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

const exceedsAuthorized = (row: CapitalStockRow): boolean =>
  row.paid_in_shares !== null && row.authorized_shares !== null && row.authorized_shares > 0n && Number(row.paid_in_shares) > Number(row.authorized_shares) * (1 + CELL_MISMATCH_TOLERANCE);

export const pickPaidInSharesRow = <R extends CapitalStockRow>(rowsNewestFirst: R[]): { row: R; shares: bigint } | null => {
  for (let i = 0; i < rowsNewestFirst.length; i++) {
    const row = rowsNewestFirst[i]!;
    if (row.paid_in_shares === null) continue;
    const verdict = legalVerdict(row);
    if (!row.misaligned && verdict !== 'amount') return { row, shares: row.paid_in_shares };
    const middle = geometricMiddle(row);
    const legalMiddle = middle !== null && (row.authorized_shares === null || middle <= row.authorized_shares) ? middle : null;
    const candidate = legalMiddle ?? (verdict === 'amount' ? row.amount_shares! : row.paid_in_shares);
    // 2026-09-27 超過核定股數的列不當連貫性的參考：2237 2026-03 實收／核定對調（實收 2 億 > 核定 1.22 億），拿它當參考會讓
    // 2026-09 的幾何中位 1.29 億（跟現況基本資料一致）被判成不連貫、退回那列錯的 2 億。
    const previousConsistent = rowsNewestFirst.slice(i + 1).find((r) => !r.misaligned && r.paid_in_shares !== null && !exceedsAuthorized(r));
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

// 2026-09-27 規則 A：資產負債表股本當裁判（使用者：「實作，畢竟確實 MOPS 有錯的機會」）。
// 股本歷史漏記減資／增資（4702：24 季資產負債表都是 723,332 千元＝7,233 萬股，股本歷史停在 2.25 億股）、
// 實收與核定兩欄對調（2237 2026-03 實收 2 億、核定 121,772,901——兩格一起錯，恆等式與核定上限都抓不到；
// 2363、4171、4195、7715 同形狀），只有每季資產負債表的（普通股＋特別股）股本看得出來。
// 觸發條件：**整列都跟資產負債表對不上**——「選出的股數 × 面額」與「同列實收資本」都差超過 20%。
// 比金額不比股數：MOPS 自己的面額欄有寫錯的（7851 寫 0.5 實為 5、6564 寫 32 實為 10，mops-ts 原始頁確認），
// 用股數比會誤判 10 倍；同列實收資本跟資產負債表一致就代表這列沒漏事件。
// 只裁判「資產負債表季末之前生效」的列：季末之後的新異動資產負債表還沒反映，不能拿舊季末去蓋。
// ponytail: 除數用面額欄，面額欄寫錯又同時漏記事件會算錯（mops 點名面額污染 10 列，目前都沒有漏記事件）。
// ponytail: 逐日型指標用「季末 ≤ 查詢日」的資產負債表，季報公告前那一個多月有前視（只影響被這條改寫的列）。
//
// 2026-09-30 門檻從 20% 收到 1%（使用者：「找到根因就修」）。根因是**股本歷史不是股數的權威來源**，季末的權威是資產負債表的
// 法定股本（mops-ts 查證：t05st05 對 394 家本來就沒有 2024 年後的事件、0 家漏抓；4702 連 −68% 的減資都沒記）。
// 原本的 20% 是拿「年報 EPS 隱含股數」當裁判定的，那是**期間加權平均**，季中有增資的公司本來就對不上季末股數，裁判本身有偏差。
// 實測 115Q2：差 1~20% 的 118 家（85 家股本歷史超過一年沒異動＝漏記；33 家近一年有異動＝資產負債表領先登記——2314、2464、3033
// 的季末資產負債表股數＝股本歷史 7~8 月才登記的那一筆，可轉債轉換／員工認股先發行後登記）；抽查的例外（3702、1795、3138、5706、8467）
// 也都是資產負債表對。6115 股本歷史停在 2012/01 的 1.64 億股、資產負債表 1.88 億股，差 14.6%，20% 時 EPS 每季 +14%。
// 1%：只留四捨五入。面額不是新台幣的外國企業（910861 面額 0.1、4157 0.003）資本 ÷ 面額沒有意義，維持原本 20% 的比對。
const BALANCE_SHEET_MAX_GAP = 0.01;
const FOREIGN_PAR_MAX_GAP = 0.2;

export interface BalanceSheetCapital {
  quarterEndYm: number; // 季末 年*100+月
  capitalThousands: bigint; // 普通股＋特別股股本（千元）
}

export const reconcileWithBalanceSheet = (
  picked: { shares: bigint; ym: number; parValue: number | null; paidInCapital: bigint | null },
  bs: BalanceSheetCapital | null
): bigint => {
  if (!bs || bs.quarterEndYm < picked.ym || !picked.parValue || picked.parValue <= 0 || bs.capitalThousands <= 0n) return picked.shares;
  const bsCapital = Number(bs.capitalThousands) * 1000;
  const maxGap = picked.parValue < 1 ? FOREIGN_PAR_MAX_GAP : BALANCE_SHEET_MAX_GAP;
  const near = (capital: number) => Math.abs(capital / bsCapital - 1) <= maxGap;
  if (near(Number(picked.shares) * picked.parValue) || (picked.paidInCapital !== null && near(Number(picked.paidInCapital)))) return picked.shares;
  return BigInt(Math.round(bsCapital / picked.parValue));
};
