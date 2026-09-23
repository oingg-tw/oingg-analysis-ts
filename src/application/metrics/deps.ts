import type { FinancialStatementsPort } from '@/application/ports/financialStatements';
import type { QuarterResolverPort } from '@/application/ports/quarterResolver';
import type { AnnouncementDatePort } from '@/application/ports/announcementDates';
import type { PaidInSharesPort } from '@/application/ports/capitalStock';
import type { MarketDataPort } from '@/application/ports/marketData';
import type { XbrlAccountsPort } from '@/application/ports/xbrlAccounts';
import type { IndustryPort } from '@/application/ports/industry';
import type { DividendEventsPort } from '@/application/ports/dividendEvents';
import type { MonthlyRevenuePort } from '@/application/ports/monthlyRevenue';
import type { MetricValueRepository } from '@/application/ports/metricValues';
import type { MetricDefinitionLookup } from '@/application/ports/metricDefinitions';
import type { PriceLevelPort } from '@/application/ports/priceLevel';

// 2026-09-17 clean architecture 重構 Phase 3：指標核心的依賴集合。每支 computeXxx 的最後一個參數
// 是 `deps: Pick<PitDeps, ...>`——只挑自己真的用到的 port（跟 2026-09-13 起用交集型別挑
// 單方法介面是同一個精神），由 src/bootstrap/pitDeps.ts 綁定真實實作一次、tests/fakes/pit/
// createTestPitDeps.ts 綁假的。不用 DI 容器，就是一個明確傳遞的物件。
//
// 每個欄位對應一個上游關注點（application/ports/ 一檔一個）；加新 port 時同步補 bootstrap 的綁定
// 跟 fakes 的預設 stub。
export interface PitDeps {
  statements: FinancialStatementsPort; // 三大表 + 保險業損益表 + 銀行三張監理表（按季，QuarterlyKey）
  quarters: QuarterResolverPort; // 各張表「最新到哪一季」
  announcements: AnnouncementDatePort; // 財報公告日（knowledge_date 傳染）
  shares: PaidInSharesPort; // 流通股數（股本異動）
  market: MarketDataPort; // 股價/市值/每日估值/價格序列
  xbrlAccounts: XbrlAccountsPort; // 寬表沒有的 XBRL 原始科目
  industry: IndustryPort; // 產業別 gating
  dividendEvents: DividendEventsPort; // 股利分派事件
  monthlyRevenue: MonthlyRevenuePort; // 月營收（上市＋上櫃，2021-09 起）——月頻指標 sus 用
  priceLevel: PriceLevelPort; // 美元匯率＋美國 GNP 平減指數（Ohlson SIZE 換算）
  metricValues: MetricValueRepository; // metric_values / metric_daily_cadence_values 讀寫
  definitions: MetricDefinitionLookup; // 寫入前座標驗證用的 definition 查詢
}
