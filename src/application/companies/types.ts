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
  financialReportType: string | null; // 裸代碼 "1"/"2"
  financialReportTypeName: string | null; // 「個別財報」/「合併財報」，未知代碼 null
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
}
