// 產業別判斷 port——指標核心用它做「這支指標適不適用這家公司」的 gating（金融業不算 Altman Z /
// Beneish / Ohlson / Zmijewski、只有軟體雲端業算 Rule of 40、Z'' 看 DGBAS 大類）。兩種現行行為都要原樣
// 保留：有的指標是「跳過不寫」，有的是「寫 not_applicable_industry」，見各 compute 檔頭說明。
// 實作在 infrastructure/repositories/exchange/industryPort.ts（前兩個查交易所 company_profile 的
// 產業代碼，第三個查 gov-ts 的 company_industry_classification）。
export interface IndustryPort {
  isFinancialIndustryCompany(symbol: string): Promise<boolean>;
  isSoftwareOrCloudIndustryCompany(symbol: string): Promise<boolean>;
  // DGBAS 行業標準分類的大類代碼（A~S），查無資料回 null。
  getCompanySectionCode(symbol: string): Promise<string | null>;
}
