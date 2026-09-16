import type { AppDeps } from '@/application/deps';
import { logger } from '@/infrastructure/logger';
import { macroData } from '@/infrastructure/repositories/macro/macroDataPort';
import { exchangeCompanyProfiles } from '@/infrastructure/repositories/exchange/companyProfile';
import { exchangePreferredStocks } from '@/infrastructure/repositories/exchange/preferredStock';
import { analysisMetricValueQueries } from '@/infrastructure/repositories/analysis/metricValueQueries';
import { industryReferenceData } from '@/infrastructure/cache/industryReferenceData';
import { mopsCapitalStockHistory } from '@/infrastructure/repositories/mops/capitalStock';
import { twseDevMonthlyRevenue } from '@/infrastructure/repositories/twse/monthlyRevenue';
import { mopsFinancialStatementRows } from '@/infrastructure/repositories/mops/financialStatementRows';
import { exchangeValuationRanking } from '@/infrastructure/repositories/exchange/dailyValuationRanking';
import { createPitDeps } from './pitDeps';

// 整個服務的 composition root：指標核心的 pitDeps 加上 HTTP use case 用的 port。全 repo 只有這裡（跟測試的
// fakes）知道「哪個 port 由哪個資料庫的哪個查詢實作」。Phase 4 逐模組遷移時在這裡加綁定。
export const createAppDeps = (): AppDeps => ({
  ...createPitDeps(),
  logger,
  macroData,
  companyProfiles: exchangeCompanyProfiles,
  metricValueQueries: analysisMetricValueQueries,
  preferredStocks: exchangePreferredStocks,
  industryReference: industryReferenceData,
  capitalStockHistory: mopsCapitalStockHistory,
  monthlyRevenue: twseDevMonthlyRevenue,
  statementRows: mopsFinancialStatementRows,
  valuationRanking: exchangeValuationRanking,
});

export const appDeps: AppDeps = createAppDeps();
