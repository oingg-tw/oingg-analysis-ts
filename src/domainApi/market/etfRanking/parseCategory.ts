export interface EtfCategoryDetail {
  market: 'TWSE' | 'TPEx';
  assetClass: string | null; // 國內成分證券/國外成分證券/債券成分/槓桿型/反向型/多資產/連結式，主動式 ETF 沒有這個概念時是 null
  isActive: boolean; // 主動式 ETF——不追蹤特定指數，經理人依自訂策略操作
}

// etf_basic_info.category 把「市場別（上市/上櫃）+ 成分類型（國內/國外/槓桿/反向/多資產/
// 連結式/債券成分）+ 是否為主動式」三個維度混在同一個字串裡，例如「上市ETF_國外成分證券ETF」
// 跟「上市」（沒有成分類型後綴）。2026-09-02 應使用者要求拆成獨立欄位，方便之後 ETF screener
// 依市場別/資產類型/是否主動式分開篩選。
//
// 純「上市」/「上櫃」（沒有 ETF_..ETF 後綴）就是主動式 ETF——實測驗證過：etf_basic_info 裡
// tracking_index 寫「本基金投資目標未追蹤、模擬或複製特定指數之表現…」的 36 檔，
// category 恰好就是這 36 檔（上市31+上櫃5），完全對應，不是巧合，這裡直接用 category
// 有沒有成分類型後綴判斷 isActive，不用另外查 tracking_index。
const CATEGORY_PATTERN = /^(上市|上櫃)(?:ETF_(.+)ETF)?$/;

export const parseEtfCategory = (category: string | null): EtfCategoryDetail | null => {
  if (!category) return null;
  const match = category.match(CATEGORY_PATTERN);
  if (!match) return null;

  const [, marketText, assetClassRaw] = match;
  return {
    market: marketText === '上市' ? 'TWSE' : 'TPEx',
    assetClass: assetClassRaw ?? null,
    isActive: assetClassRaw === undefined,
  };
};
