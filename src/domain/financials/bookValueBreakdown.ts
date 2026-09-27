// 2026-09-27 淨值變動拆解（每股）——使用者：「我要怎麼看出推動淨值成長的來源組成？」拍板先做流量拆解、每股呈現。
// 一年的每股淨值變動拆成：歸屬普通股淨利、其他綜合損益（匯率換算、FVOCI 評價…）、現金股利（宣告時認列，權益變動表的數字，
// 不會因為現金流量表缺一季就斷掉——2412 那種）、增資（現金增資、可轉債轉換、合併發行），再加兩項：
// - 股數變動影響：期初淨值在「期末股數」下每股變多少（增資稀釋、買回庫藏股集中）。流量除以期末股數、期初淨值的稀釋另外列，
//   期初 + 各項 = 期末 恆等成立（不是近似）。股數都已換算到今天的基準（分割、配股不會變成「股數影響」，見 restatePerShareHistory）。
// - 其他（未分類）：期末 − 期初 − 以上各項。權益變動表對得上的公司（2025 年 73% 差在期初 1% 內）這一項很小；對不上的多半是
//   庫藏股買回、員工酬勞、子公司持股變動這些權益變動表沒有獨立欄位的項目，照實放這裡，不硬塞進別的項目。
// 普通股口徑跟 bvps 一致：權益扣特別股股本、淨利扣特別股股利。金額是千元、股數是股，每股 = 千元 × 1000 ÷ 股。
export interface AnnualEquityChange {
  openingEquityThousands: number; // 歸屬母公司權益（含特別股股本），期初（有追溯重編時用重編後）
  closingEquityThousands: number;
  netIncomeThousands: number; // 歸屬母公司淨利
  otherComprehensiveIncomeThousands: number;
  commonCashDividendsThousands: number; // 負數（權益減少）
  preferredCashDividendsThousands: number; // 負數
  capitalIssuedThousands: number; // 現金增資＋可轉債權益組成＋組織重整發行
}

export interface BookValueBreakdown {
  openingBvps: number;
  netIncome: number;
  otherComprehensiveIncome: number;
  cashDividends: number;
  capitalIssued: number;
  shareCountEffect: number;
  other: number;
  closingBvps: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const breakDownBookValueChange = (
  y: AnnualEquityChange,
  preferredCapitalThousands: { opening: number; closing: number },
  shares: { opening: number; closing: number }
): BookValueBreakdown | null => {
  if (!(shares.opening > 0) || !(shares.closing > 0)) return null;
  const perShare = (thousands: number) => (thousands * 1000) / shares.closing;
  const openingBvps = ((y.openingEquityThousands - preferredCapitalThousands.opening) * 1000) / shares.opening;
  const closingBvps = ((y.closingEquityThousands - preferredCapitalThousands.closing) * 1000) / shares.closing;
  const netIncome = perShare(y.netIncomeThousands + y.preferredCashDividendsThousands);
  const otherComprehensiveIncome = perShare(y.otherComprehensiveIncomeThousands);
  const cashDividends = perShare(y.commonCashDividendsThousands);
  const capitalIssued = perShare(y.capitalIssuedThousands);
  const shareCountEffect = ((y.openingEquityThousands - preferredCapitalThousands.opening) * 1000) / shares.closing - openingBvps;
  const other = closingBvps - openingBvps - shareCountEffect - netIncome - otherComprehensiveIncome - cashDividends - capitalIssued;
  return {
    openingBvps: round2(openingBvps),
    netIncome: round2(netIncome),
    otherComprehensiveIncome: round2(otherComprehensiveIncome),
    cashDividends: round2(cashDividends),
    capitalIssued: round2(capitalIssued),
    shareCountEffect: round2(shareCountEffect),
    other: round2(other),
    closingBvps: round2(closingBvps),
  };
};
