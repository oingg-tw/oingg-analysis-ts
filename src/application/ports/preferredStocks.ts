// 特別股 port——兩張表分屬不同資料庫：twse-ts 的 isin_securities（目前上市中的證券登記清單，用來篩出哪些
// symbol 是特別股）跟 mops-ts 的 preferred_stock_right（發行條款）。實作在
// infrastructure/repositories/exchange/preferredStock.ts。

export interface PreferredStockSecurity {
  symbol: string;
  name: string;
  isinCode: string;
  listedDate: Date;
  marketType: string;
}

export interface PreferredStockRight {
  issueDate: Date;
  issuePrice: number | null;
  dividendRate: number | null; // 每股固定配息金額（新台幣元），不是百分比——2026-09-06 逐檔實測驗證過，欄位名稱容易誤會
  cumulativeDividend: boolean;
  participatingExcessDividend: boolean;
  liquidationPreference: boolean;
  votingRights: boolean;
  convertible: boolean;
  conversionStartDate: Date | null;
  redeemable: boolean;
  redemptionDate: Date | null;
  redemptionConditions: string | null;
  // 2026-09-08 mops-ts 新增：這檔是否在人工驗證覆寫表裡有記錄，跟 redemptionDate 是否為
  // null 是兩件事——1312A/2002A 這種「已查證章程、確認有收回權但條款本身沒有固定收回日」
  // 跟「自動化資料，沒有人查證過」原本混在一起分不清，這個欄位解決這個問題。null 代表
  // mops-ts 這批資料還沒有這個欄位或查無記錄，前端不應該當成「已查證為 false」。
  redemptionVerified: boolean | null;
}

export interface PreferredStockPort {
  // 只回傳目前上市中的特別股（isin_securities 是「目前有效登記」清單，不是歷史檔案）。
  getPreferredStockSecurities(): Promise<PreferredStockSecurity[]>;
  // 同一個 code 會有多列（series_no 遞增）代表配息條件歷次修訂，取最新一次；表不存在時優雅降級為 null。
  getLatestPreferredStockRight(preferredStockCode: string): Promise<PreferredStockRight | null>;
}
