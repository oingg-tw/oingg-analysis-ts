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
