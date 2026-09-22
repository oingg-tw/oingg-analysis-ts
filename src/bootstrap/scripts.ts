import { listSymbolsWithIncomeStatement, listBankSymbols, listBankSymbolsForQuarter, listSymbolsWithBankIncomeStatement } from '@/infrastructure/repositories/mops/backfillUniverse';
import { getSymbolsWithDividendDistribution } from '@/infrastructure/repositories/mops/dividendDistribution';
import { listDailyPriceTradeDates, listDailyValuationTradeDates } from '@/infrastructure/repositories/twse/backfillUniverse';
import { listManufacturingSymbols } from '@/infrastructure/repositories/gov/backfillUniverse';
import { isFinancialIndustryCompany, listCompaniesBySectorCodes } from '@/infrastructure/repositories/exchange/securitiesIndustry';
import { listLatestTtmValuesAcrossMarket, listMetricValuesForGapScan, countShadowRowsSince, listRankDegeneracy } from '@/infrastructure/repositories/analysis/backfillQueries';
import { mopsReportAvailability } from '@/infrastructure/repositories/mops/companyReportAvailability';

// scripts/ 的唯一資料出口（scripts-only-bootstrap 規則：scripts 只能 import src/bootstrap 跟 src/domain）——
// 2026-09-17 Phase 6：51 支 backfill/稽核腳本原本各自 import Prisma client 直接寫 raw SQL、自己 $disconnect，
// 改成這裡綁定好的查詢 + ./db 的 disconnectAllDbs（scripts 直接從 ./db import）。指標計算本身走
// ./pitMetrics，metric_definitions 走 ./metricDefinitions。這些都是「決定要跑哪些公司/哪些交易日」的母體
// 查詢，不是指標邏輯。
export type { LatestTtmMetricRow } from '@/infrastructure/repositories/analysis/backfillQueries';

export const backfillUniverse = {
  listSymbolsWithIncomeStatement,
  listBankSymbols,
  listBankSymbolsForQuarter,
  listSymbolsWithBankIncomeStatement,
  listSymbolsWithDividendDistribution: getSymbolsWithDividendDistribution,
  listDailyPriceTradeDates,
  listDailyValuationTradeDates,
  listManufacturingSymbols,
  listCompaniesBySectorCodes,
  isFinancialIndustryCompany,
};

// 每家公司的財報口徑（'1' 個體／'2' 合併），scripts/backfillTaskDefinitions.ts 組 query 時用；見 application/ports/reportAvailability.ts。
export const reportAvailability = mopsReportAvailability;

export const analysisQueries = { listLatestTtmValuesAcrossMarket, listMetricValuesForGapScan, countShadowRowsSince, listRankDegeneracy };
