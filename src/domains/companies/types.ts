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
  // 2026-09-02 應 bff-ts/web-nuxt 要求新增——financialReportType 是裸代碼（"1"/"2"），前端顯示
  // 沒意義。MOPS 沒有公開的欄位字典，這個對照是跟 mops-ts 確認過的（他們專案內部從三表 domain
  // 開始就用同一套慣例：dataType '1'=個體/個別財報、'2'=合併財報，且用另一個 MOPS 端點
  // t164sb01 的 REPORT_ID 參數 'A'（個別）/'C'（合併）交叉印證過，信心度高但不是白紙黑字的
  // 官方文件），跟 industryName 一樣是本服務自己解出來的可讀名稱，不是 company_profile 原始欄位。
  financialReportTypeName: string | null;
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
