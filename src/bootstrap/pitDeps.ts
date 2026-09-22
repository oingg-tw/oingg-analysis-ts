import type { PitDeps } from '@/application/metrics/deps';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import { xbrlAccounts, xbrlFinancialStatements, xbrlQuarterResolver } from '@/infrastructure/repositories/mops/financialStatementPorts';
import { mopsAnnouncementDates } from '@/infrastructure/repositories/mops/reportAnnouncementDate';
import { mopsCapitalStockShares } from '@/infrastructure/repositories/mops/capitalStock';
import { mopsDividendEvents } from '@/infrastructure/repositories/mops/dividendDistribution';
import { twseMarketData } from '@/infrastructure/repositories/twse/marketCap';
import { exchangeIndustry } from '@/infrastructure/repositories/exchange/industryPort';
import { prismaMetricValueRepository } from '@/infrastructure/repositories/analysis/metricValueRepository';
import { govPriceLevel } from '@/infrastructure/repositories/gov/priceLevel';

// 指標核心的 composition root：把 infrastructure 的實作綁到 application 宣告的 port 上，組成
// 一份 PitDeps。全 repo 只有這裡（跟測試的 fakes）知道「哪個 port 由哪個資料庫的哪個查詢實作」。
// Phase 4 起 HTTP use case 走 src/bootstrap/deps.ts 的 AppDeps（PitDeps 的超集），這裡只服務指標核心。
export const createPitDeps = (): PitDeps => ({
  statements: xbrlFinancialStatements,
  quarters: xbrlQuarterResolver,
  announcements: mopsAnnouncementDates,
  shares: mopsCapitalStockShares,
  market: twseMarketData,
  xbrlAccounts,
  industry: exchangeIndustry,
  dividendEvents: mopsDividendEvents,
  priceLevel: govPriceLevel,
  metricValues: prismaMetricValueRepository,
  definitions: { get: (metricCode) => metricDefinitionRegistry[metricCode] },
});

export const pitDeps: PitDeps = createPitDeps();
