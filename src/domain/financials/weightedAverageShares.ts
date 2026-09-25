// 2026-09-25 年報口徑（FY）每股科目的分母：年報用的「全年加權平均流通股數」。
//
// 為什麼要反推：台灣 iXBRL 分類標準裡沒有加權平均股數這個元素（mops-ts 掃過 4 版 × 6 業態 taxonomy，
// 零命中），年報只揭露結果——基本每股盈餘。所以股數只能從「歸屬母公司淨利 ÷ 年報 EPS」反推。
// 使用者拍板用這個而不是年底股本：瀑布圖每一段都除以同一個股數才對得起來，而最後一格要等於年報公告的
// EPS。年底股本做不到後者——110~113 年反推股數跟年底股本差超過 5% 的約 15%（年中增資、減資、庫藏股）。
//
// 為什麼有門檻：年報 EPS 只到小數兩位，捨入誤差最多 0.005 元，反推股數的相對誤差約 0.005 ÷ |EPS|。
// |EPS| < 0.1 時超過 5%，而且錯了整條瀑布圖會等比例縮放、照樣閉合，EPS 那一格又是被拿來反推的所以必然吻合
// ——閉合檢查抓不到（bff-ts 指出）。110~113 年 |EPS| < 0.1 的公司年度約 3.2%，這些年度不提供每股拆解；
// EPS 與股利仍照常有數值（都是公告值，不需要股數）。**不要退回用年底股本頂替**：那會在同一張圖混兩種口徑。
//
// 分子要跟官方 EPS 同口徑：歸屬母公司業主淨利（沒有揭露時退回合併淨利，跟 pickNetIncomeValue 同一個規則）。
// ponytail: 已知偏誤——有特別股的公司（約 20 家，多為金控：1101/1522/2002/2348/2881/2882/2883/2887/2891/2897…），官方 EPS
// 的分子是「歸屬母公司淨利 − 特別股股利」，這裡沒扣，反推股數偏高、每段每股偏低約「特別股股利 ÷ (淨利 − 特別股股利)」。
// 瀑布圖照樣閉合、EPS 那格照樣等於公告值，閉合檢查抓不到（bff-ts 2026-09-25 指出「閉合不證明分母」）。
// 「反推 vs 年底股本」對它們也失效：年底實收股數含特別股。要修：找到特別股股利總額（先查 XBRL 科目）從分子扣掉。
export const MIN_ABS_EPS_FOR_SHARE_DERIVATION = 0.1;

export const deriveWeightedAverageShares = (netIncomeInThousands: bigint | null, basicEps: number | null): bigint | null => {
  if (netIncomeInThousands === null || basicEps === null) return null;
  if (Math.abs(basicEps) < MIN_ABS_EPS_FOR_SHARE_DERIVATION) return null;
  const shares = Math.round((Number(netIncomeInThousands) * 1000) / basicEps);
  // 淨利與 EPS 正負號相反＝資料不一致（不同報表口徑或錯置），反推出負股數，不硬算。
  return shares > 0 ? BigInt(shares) : null;
};
