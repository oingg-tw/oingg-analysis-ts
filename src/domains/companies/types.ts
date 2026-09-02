// 2026-09-02 應 bff-ts 要求新增（個股詳情頁的公司基本資料卡片）——欄位清單直接照他們給的
// camelCase 名稱，bigint 欄位（paidInCapital/issuedShares/...）序列化成 string，跟本服務
// 其他大數字欄位（例如 revenueRanking 的 currentMonthRevenue）同樣的慣例，避免 JS 數字精度問題。
export interface CompanyProfileDetail {
  symbol: string;
  market: 'TWSE' | 'TPEx';
  reportDate: string | null;
  name: string | null;
  shortName: string | null;
  foreignRegistrationCountry: string | null;
  industry: string | null;
  // 2026-09-02 應 bff-ts/web-nuxt 要求新增——industry 是裸代碼（例如 "24"），前端顯示沒意義。
  // TWSE company_profile 本身就有這個欄位（例如 "半導體業"），直接透傳；TPEx 的 export view
  // 沒有對應欄位，這邊先回 null，已經去信請 tpex-ts 評估補上（見對話紀錄），避免自己猜代碼
  // 對照表猜錯——bff-ts 明確要求「有官方對照表才給，不要亂猜」。
  industryName: string | null;
  address: string | null;
  taxId: string | null;
  chairman: string | null;
  generalManager: string | null;
  spokesperson: string | null;
  spokespersonTitle: string | null;
  deputySpokesperson: string | null;
  phone: string | null;
  establishedDate: string | null;
  listedDate: string | null;
  parValue: number | null;
  paidInCapital: string | null;
  privatePlacementShares: string | null;
  preferredStockShares: string | null;
  financialReportType: string | null;
  stockTransferAgency: string | null;
  transferAgencyPhone: string | null;
  transferAgencyAddress: string | null;
  auditingFirm: string | null;
  auditor1: string | null;
  auditor2: string | null;
  englishShortName: string | null;
  englishAddress: string | null;
  faxNumber: string | null;
  email: string | null;
  website: string | null;
  issuedShares: string | null;
}
