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
export interface ReportAvailabilityPort {
  // 查無這家公司（view 沒列到）時回 '2'，維持既有行為。
  resolveDataType(symbol: string): Promise<StatementDataType>;
}
