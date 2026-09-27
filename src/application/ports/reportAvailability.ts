import type { StatementDataType } from '@/domain/financials/quarterlyMetric';

// 2026-09-22：mops-ts 確認「一律查 data_type='2'（合併報表）」會漏掉 249 家結構上沒有子公司、只申報個體
// 報表（data_type='1'）的公司（含 2816/2820/2836/2849/2851/5863 等金融股，其餘多為興櫃），這些公司等不到
// 合併報表。使用者拍板「每家公司決定一種口徑」：有合併報表就永遠用 '2'，完全沒有才用 '1'，不逐季混用
// （有合併報表的公司某季缺列時寧可 insufficient，也不拿個體數字頂）。判斷來源是 mops-ts 的
// export.company_report_availability（一列一家，以損益表核心表為準）。
// 這個 port 是全 repo 唯一決定 dataType 的地方：回填母體、每支 compute 的 query、讀取端（history/badges/
// screener/provenance/財報透傳）都要經過它，不再寫死 '2'。逐日型指標（beta/marketRatios/live*）也用同一個
// 口徑鍵——live* 本來就讀損益表，beta/marketRatios 雖是純市場數字，但同一家公司只該有一種 data_type，
// 否則 metrics-history 會拆成兩條序列。
// 2026-09-27 按期別決定（見 domain/financials/reportDataType.ts）：合併報表申報範圍內用 '2'（缺列照舊 insufficient，不拿個體頂），
// 合併停掉 2 季以上、改只編個體的公司（31 家：2941、4126、5403、1623、1727、1524…）之後的期別用 '1'，歷史接起來。
export interface ReportAvailabilityPort {
  // 最新一期的口徑（逐日型指標、最新值、沒有期別的查詢）。查無這家公司（view 沒列到）時回 '2'，維持既有行為。
  resolveDataType(symbol: string): Promise<StatementDataType>;
  // 某一期（民國年、季）的口徑——季報型指標的計算與歷史查詢按期別用它。
  resolveDataTypeForPeriod(symbol: string, rocYear: number, quarter: number): Promise<StatementDataType>;
}
