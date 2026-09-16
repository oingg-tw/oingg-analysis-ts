export interface EtfCategoryDetail {
  market: 'TWSE' | 'TPEx';
  assetClass: string | null; // 國內成分證券/國外成分證券/債券成分/槓桿型/反向型/多資產/連結式，主動式 ETF 沒有這個概念時是 null
}

// etf_basic_info.category 把「市場別（上市/上櫃）+ 成分類型（國內/國外/槓桿/反向/多資產/
// 連結式/債券成分）」兩個維度混在同一個字串裡，例如「上市ETF_國外成分證券ETF」跟「上市」
// （沒有成分類型後綴）。2026-09-02 應使用者要求拆成獨立欄位，方便之後 ETF screener 依市場別/
// 資產類型分開篩選。
//
// 2026-09-04：是否為主動式 ETF 原本也是從這裡（category 有沒有成分類型後綴）猜的——實測驗證過
// 36 檔完全對應 tracking_index 寫「未追蹤/模擬/複製特定指數」的檔數，不是巧合——但 sitca-ts
// 之後直接開了權威欄位 etf_basic_info.is_actively_managed，不用再用這個 heuristic 猜，
// 已改成直接讀那個欄位（見 etfRanking/service.ts、etfScreener/queryBuilder.ts），這裡不再
// 提供 isActive。
const CATEGORY_PATTERN = /^(上市|上櫃)(?:ETF_(.+)ETF)?$/;

export const parseEtfCategory = (category: string | null): EtfCategoryDetail | null => {
  if (!category) return null;
  const match = category.match(CATEGORY_PATTERN);
  if (!match) return null;

  const [, marketText, assetClassRaw] = match;
  return {
    market: marketText === '上市' ? 'TWSE' : 'TPEx',
    assetClass: assetClassRaw ?? null,
  };
};
