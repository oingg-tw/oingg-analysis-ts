import type { Season } from './rocQuarter';

// 季度財報類指標共用的查詢介面——year/season 選填但要成對，不給就自動抓「該指標實際依賴的
// 財報表都有資料」的最新一季（見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效
// 請求（在 controller 用 zod refine 擋掉）。「實際依賴哪些表」因指標而異，各自 types.ts 的
// XxxQuery 型別別名上方會補充說明。
export interface QuarterlyMetricQuery {
  symbol: string;
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

// 季度財報類指標 Result 開頭共用的「查詢身分」欄位。
export interface QuarterlyMetricIdentity {
  symbol: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;
}

// 需要回報 TTM 用了哪幾季、缺了哪幾季的指標共用這個形狀。
export interface QuarterlyMetricTtmInfo {
  quartersUsed: string[];
  quartersMissing: string[];
}
