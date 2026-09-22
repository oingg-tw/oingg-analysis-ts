// 2026-09-17 clean architecture 重構 Phase 1：公司基本資料 DTO 的 TypeScript 型別。原本由
// http/modules/companies/types.ts 的 zod schema 用 z.infer 反推，infrastructure 的
// companyProfile.ts 反過來 import HTTP 層的型別（依賴反轉 + 循環）。現在 application 擁有這個
// 純介面，HTTP 層的 zod schema 用 `satisfies z.ZodType<CompanyProfileDetail>` 釘住，兩邊
// 對不上會編譯失敗，不會默默漂移。
//
// bigint 欄位（paidInCapital/issuedShares/...）序列化成 string，跟本服務其他大數字欄位同樣的
// 慣例，避免 JS 數字精度問題。
export interface CompanyProfileDetail {
  symbol: string;
  market: 'TWSE' | 'TPEx';
  reportDate: string | null;
  name: string | null;
  shortName: string | null;
  foreignRegistrationCountry: string | null;
  industry: string | null; // 產業裸代碼，例如 "24"
  industryName: string | null; // 可讀產業名稱；TPEx 目前沒有對應欄位，一律 null
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
  financialReportType: string | null; // 交易所「編製財務報告類型」裸代碼："1" 合併、"2" 個別（跟 MOPS dataType 相反）
  financialReportTypeName: string | null; // 「合併財報」/「個別財報」，未知代碼 null
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
  website: string | null; // 已正規化成裸網域（去 scheme/尾斜線/www.）
  issuedShares: string | null;
  // 2026-09-22 新增：本服務所有指標對這家公司實際採用的財報口徑（MOPS dataType，'2' 合併／'1' 個體），來自
  // mops-ts 的 export.company_report_availability——有合併報表就永遠用合併，完全沒有才用個體（249 家）。前端要
  // 標示「個體報表」看這個欄位，不要看交易所申報的 financialReportType（兩者對 31 家不一致）。
  metricDataType: '1' | '2';
}

// 交易所 company_profile 能給的部分（不含 metricDataType，那是 use case 從 ReportAvailabilityPort 補上的）。
export type ExchangeCompanyProfileDetail = Omit<CompanyProfileDetail, 'metricDataType'>;
