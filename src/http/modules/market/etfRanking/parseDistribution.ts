// etf_basic_info.distribution_class_info 把「級別（不分級別/其他級別）+ 是否配息 + 配息頻率」
// 混在同一個字串裡，例如「不分級別/分配(月配)」「其他級別/不分配」。2026-09-02 應使用者
// 要求（web-nuxt 轉達：退休/存股儀表板要顯示配息頻率，因為單筆配息滿 2 萬會扣二代健保
// 補充保費 2.11%，月配息比較容易避開單筆超標，是客觀顯示欄位，不是投資建議），只抽「配息
// 頻率」這個維度出來，不管級別（那個維度目前沒有用得到的地方）。
//
// 實測看過的原始值：不分配(2種級別) → 統一回傳「不分配」；分配(月配/季配/半年配/年配/
// 一年兩次配息/其他) → 直接回傳括號內的頻率文字，不重新翻譯成別的詞（"其他" 本身就是
// sitca-ts 的實際分類值，不是我們解析失敗）。
export const parseDistributionFrequency = (raw: string | null): string | null => {
  if (!raw) return null;
  if (raw.includes('不分配')) return '不分配';
  const match = raw.match(/分配\((.+)\)/);
  return match ? match[1]! : null;
};
