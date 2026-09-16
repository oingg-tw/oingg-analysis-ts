import type { FinancialStatementsPort } from '@/application/ports/financialStatements';
import type { QuarterResolverPort } from '@/application/ports/quarterResolver';
import type { AnnouncementDatePort } from '@/application/ports/announcementDates';
import type { PaidInSharesPort } from '@/application/ports/capitalStock';
import type { MarketDataPort } from '@/application/ports/marketData';
import type { MetricValueRepository } from '@/application/ports/metricValues';
import type { MetricDefinitionLookup } from '@/application/ports/metricDefinitions';

// 2026-09-17 clean architecture 重構 Phase 3：指標核心的依賴集合。每支 computeXxx 的最後一個參數
// 是 `deps: Pick<PitDeps, ...>`——只挑自己真的用到的 port（跟 2026-09-13 起用交集型別挑
// 單方法介面是同一個精神），由 src/bootstrap/pitDeps.ts 綁定真實實作一次、tests/fakes/pit/
// createTestPitDeps.ts 綁假的。不用 DI 容器，就是一個明確傳遞的物件。
//
// 欄位隨 family 遷移逐步增加（beta 的價格序列、研發費用、產業別、銀行監理資料、股利事件…），
// 每加一個 port 就同步補 bootstrap 的綁定跟 fakes 的預設 stub。
export interface PitDeps {
  statements: FinancialStatementsPort;
  quarters: QuarterResolverPort;
  announcements: AnnouncementDatePort;
  shares: PaidInSharesPort;
  market: MarketDataPort;
  metricValues: MetricValueRepository;
  definitions: MetricDefinitionLookup;
}
