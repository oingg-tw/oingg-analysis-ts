// 產業別判斷 port——指標核心用它做「這支指標適不適用這家公司」的 gating（金融業不算 Altman Z /
// Beneish / Ohlson / Zmijewski、只有軟體雲端業算 Rule of 40、Z'' 只算非製造業類股）。兩種現行行為都要原樣
// 保留：有的指標是「跳過不寫」，有的是「寫 not_applicable_industry」，見各 compute 檔頭說明。
// 實作在 infrastructure/repositories/exchange/industryPort.ts（全部查交易所 company_profile 的類股代碼）。
// 2026-10-02 Z″ 改用交易所類股後，gov-ts 稅籍分類（getCompanySectionCode）不再使用。
export interface IndustryPort {
  isFinancialIndustryCompany(symbol: string): Promise<boolean>;
  isSoftwareOrCloudIndustryCompany(symbol: string): Promise<boolean>;
  // 證交所／櫃買類股代碼（兩碼，例如 '24' 半導體業），查無資料回 null。
  getSecuritiesSectorCode(symbol: string): Promise<string | null>;
}
