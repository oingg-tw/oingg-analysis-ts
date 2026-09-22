import type { Season } from '../calendar/rocQuarter';

// 季度財報類指標共用的查詢介面——year/season 選填但要成對，不給就自動抓「該指標實際依賴的
// 財報表都有資料」的最新一季（見 models/latestQuarter.ts），只給其中一個視為無效
// 請求（在 controller 用 zod refine 擋掉）。「實際依賴哪些表」因指標而異，各自 types.ts 的
// XxxQuery 型別別名上方會補充說明。
// 財報口徑：'1' = 個體（個別）報表、'2' = 合併報表。2026-09-22 起每家公司只用一種（見 application/ports/
// reportAvailability.ts），由 ReportAvailabilityPort 決定，不再寫死 '2'。
export type StatementDataType = '1' | '2';

export interface QuarterlyMetricQuery {
  symbol: string;
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: StatementDataType;
  subsidiaryCompanyId: string;
}

// （原本還有舊架構指標 Result 共用的 QuarterlyMetricIdentity / QuarterlyMetricTtmInfo，2026-09-08 那批
// 指標退場後沒有消費端，2026-09-17 Phase 6 死碼清理刪除。）
