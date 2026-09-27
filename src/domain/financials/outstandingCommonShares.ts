// 2026-09-25 每股指標的分母改成 IAS 33 的「流通在外普通股」（使用者拍板，方案 1）：
//   流通在外普通股 = 已發行股數 − 特別股股數 − 庫藏股股數（本公司及子公司持有）
// IAS 33 與證交所簡介：基本每股盈餘的分母是「當期流通在外普通股加權平均股數」；會計研究發展基金會釋例示範
// 「流通在外 = 已發行 − 庫藏股」。capital_stock_history 的實收股數**同時含特別股與庫藏股**——實測用
// (淨利 − 特別股股利) ÷ 官方 EPS 反推，扣掉特別股股本 ÷ 面額後才對得上（2881 1.000、2882 0.999、2887 1.004），
// 中鋼子公司持有 6.74 億股、台灣大 6.99 億股，不扣的話分母多出幾個百分點到兩成。
//
// 特別股股數 = 特別股股本（千元）× 1000 ÷ 面額。**有特別股、但三張資產負債表都查不到特別股股本**（目前是銀行：
// 2836、2838、2897，mops-ts 還沒收 tifrs-bsci-basi:PreferredStock）→ 回 null（分母定義待補），**不算出一個少扣
// 特別股、看起來合理卻有偏差的值**（mops-ts 的提醒：那種錯最難發現）。
export interface ShareCountInputs {
  issuedShares: bigint; // capital_stock_history 實收股數（含特別股、庫藏股）
  parValue: number | null; // 元／股
  preferredCapitalThousands: bigint | null; // 特別股股本（千元），null＝這張表沒揭露
  treasuryShares: bigint | null; // 本公司及子公司持有本公司股份數，null＝沒有資料（當 0）
  knownPreferredIssuer: boolean; // 近幾年有特別股配息紀錄
}

export const computeOutstandingCommonShares = (
  i: ShareCountInputs
): { outstandingCommonShares: bigint; preferredShares: bigint; treasuryShares: bigint; preferredCapitalThousands: bigint } | null => {
  const preferredCapital = i.preferredCapitalThousands ?? 0n;
  if (i.knownPreferredIssuer && preferredCapital === 0n) return null;
  const par = i.parValue && i.parValue > 0 ? i.parValue : 10;
  const preferredShares = BigInt(Math.round((Number(preferredCapital) * 1000) / par));
  const treasuryShares = i.treasuryShares ?? 0n;
  const outstanding = i.issuedShares - preferredShares - treasuryShares;
  return outstanding > 0n ? { outstandingCommonShares: outstanding, preferredShares, treasuryShares, preferredCapitalThousands: preferredCapital } : null;
};

// 分子端（方案 1 第二段）：分母只算普通股，分子也要只算屬於普通股的部分，否則有特別股的公司反而更不準。
// - EPS 類：歸屬母公司淨利 − 特別股股利（IAS 33；ARDF 釋例：累積特別股不論是否宣告都扣當期股利）。
//   特別股股利用權益變動表的年度宣告數，所以**單季扣近四季的四分之一**（按期間攤，不是宣告那一季才扣整筆）。
//   ponytail: 宣告數 vs 當期應計——累積特別股的當期股利跟「今年宣告（通常是去年的）」不一定同額，差的是特別股股利的年增減。
// - 每股淨值類：歸屬母公司權益 − 特別股股本（普通股每股淨值）。ponytail: 只扣面額部分的特別股股本，不含特別股溢價與積欠股利。
// 2026-09-26 沒有特別股股本（權益項下）就不扣特別股股利：5213 亞昕 114Q3~Q4 把普通股股利 848,626 千元申報在權益變動表的
// 特別股股利欄（普通股欄是 0），照抄會讓 EPS 從 0.42 掉到 0.12。會計上也該這樣：沒有權益類特別股時，
// 被分類為負債的特別股股利已經當利息費用從淨利扣過（IAS 32），IAS 33 不再扣第二次。
export const effectivePreferredDividends = (preferredDividendsTtmThousands: bigint, preferredCapitalThousands: bigint): bigint =>
  preferredCapitalThousands > 0n ? preferredDividendsTtmThousands : 0n;

export const toCommonEarnings = (netIncomeThousands: bigint | null, preferredDividendsTtmThousands: bigint, period: 'Q' | 'TTM'): bigint | null =>
  netIncomeThousands === null ? null : netIncomeThousands - (period === 'Q' ? preferredDividendsTtmThousands / 4n : preferredDividendsTtmThousands);

export const toCommonEquity = (equityThousands: bigint | null, preferredCapitalThousands: bigint): bigint | null =>
  equityThousands === null ? null : equityThousands - preferredCapitalThousands;

// 2026-09-27 普通股權益要扣的是特別股的**發行價**（清償時特別股股東拿回的金額），不是面額（使用者拍板「改成扣發行價」）。
// 特別股多半溢價發行（2838A 50 元、2881／2882 60 元、1101B 50 元），只扣面額會把溢價算成普通股淨值（2838 每股淨值高估約 1.8 元）。
// 各檔流通股數用股利公告的「參與分派股數」：挑出股數加總等於資產負債表特別股股數（股本 ÷ 面額 10，±1%）的那組，
// 扣除金額 = Σ 參與股數 × 發行價。這樣會自動排除已贖回的（2897A 最後配息 2025、B 250M 股剛好對上股本 25 億）
// 跟不在權益特別股股本裡的（2887I 30.96 億股；E+F+G+H+Z1 13.93 億股對上股本 139.5 億）。
// 找不到吻合的組合：近期各檔發行價都一樣就用它；沒有任何分派紀錄、但特別股權利表只有一種發行價（6958A）也用它；否則退回面額（不猜）。
// ponytail: 累積型特別股積欠未發的股息理論上也該扣，台股近年少見、資料也沒有，先不扣。
export interface PreferredSeries {
  participatingShares: number;
  issuePrice: number;
}

const PREFERRED_PAR = 10;
const MAX_SERIES_FOR_SUBSET = 12;

export const preferredClaimThousands = (preferredCapitalThousands: bigint, series: PreferredSeries[], knownIssuePrices: number[] = []): bigint => {
  if (preferredCapitalThousands <= 0n) return 0n;
  const targetShares = (Number(preferredCapitalThousands) * 1000) / PREFERRED_PAR;
  const candidates = series.filter((s) => s.participatingShares > 0 && s.issuePrice > 0).slice(0, MAX_SERIES_FOR_SUBSET);
  for (let mask = 1; mask < 1 << candidates.length; mask++) {
    const subset = candidates.filter((_, i) => mask & (1 << i));
    const shares = subset.reduce((sum, s) => sum + s.participatingShares, 0);
    if (Math.abs(shares / targetShares - 1) <= 0.01) {
      return BigInt(Math.round(subset.reduce((sum, s) => sum + s.participatingShares * s.issuePrice, 0) / 1000));
    }
  }
  const prices = [...new Set(candidates.length > 0 ? candidates.map((s) => s.issuePrice) : knownIssuePrices)];
  return prices.length === 1 ? BigInt(Math.round((Number(preferredCapitalThousands) * prices[0]!) / PREFERRED_PAR)) : preferredCapitalThousands;
};
