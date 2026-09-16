import type { PitDeps } from './metrics/deps';
import type { LoggerPort } from './ports/logger';
import type { MacroDataPort } from './ports/macroData';
import type { CompanyProfilePort } from './ports/companyProfiles';
import type { MetricValueQueryPort } from './ports/metricValueQueries';
import type { PreferredStockPort } from './ports/preferredStocks';
import type { IndustryReferenceDataPort } from './ports/industryReference';
import type { CapitalStockHistoryPort } from './ports/capitalStock';
import type { MonthlyRevenuePort } from './ports/monthlyRevenue';
import type { FinancialStatementRowsPort } from './ports/financialStatementRows';
import type { ValuationRankingPort } from './ports/valuationRanking';
import type { MarketListsPort } from './ports/marketLists';
import type { PriceChangePort } from './ports/priceChange';
import type { TaiexIndexPort } from './ports/taiexIndex';
import type { MaterialAnnouncementPort } from './ports/materialAnnouncements';
import type { EtfDataPort } from './ports/etfData';

// 2026-09-17 clean architecture 重構 Phase 4：整個服務的依賴集合——指標核心的 PitDeps 再加上 HTTP use case
// 用的 port。每個 use case 的最後一個參數是 `deps: Pick<AppDeps, ...>`（只挑自己用到的），由
// src/bootstrap/deps.ts 綁定真實實作一次；tests 用 fakes 組。欄位隨 Phase 4 逐模組遷移增加。
export interface AppDeps extends PitDeps {
  logger: LoggerPort;
  macroData: MacroDataPort;
  companyProfiles: CompanyProfilePort;
  metricValueQueries: MetricValueQueryPort;
  preferredStocks: PreferredStockPort;
  industryReference: IndustryReferenceDataPort;
  capitalStockHistory: CapitalStockHistoryPort;
  monthlyRevenue: MonthlyRevenuePort;
  statementRows: FinancialStatementRowsPort;
  valuationRanking: ValuationRankingPort;
  marketLists: MarketListsPort;
  priceChange: PriceChangePort;
  taiexIndex: TaiexIndexPort;
  materialAnnouncements: MaterialAnnouncementPort;
  etfData: EtfDataPort;
}
