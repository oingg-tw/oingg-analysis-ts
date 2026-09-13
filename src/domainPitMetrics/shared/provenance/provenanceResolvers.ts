import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { getRoeProvenance } from '@/domainPitMetrics/profitability/roe/getRoeProvenance';
import { getChowderNumberProvenance } from '@/domainPitMetrics/dividend/chowderNumber/getChowderNumberProvenance';
import { getSueProvenance } from '@/domainPitMetrics/growth/sue/getSueProvenance';
import { getAccrualsRatioProvenance } from '@/domainPitMetrics/quality/accrualsRatio/getAccrualsRatioProvenance';
import { getDividendPayoutRatioProvenance } from '@/domainPitMetrics/dividend/dividendPayoutRatio/getDividendPayoutRatioProvenance';
import { getAltmanZScoreProvenance } from '@/domainPitMetrics/resilience/altmanZScore/getAltmanZScoreProvenance';
import { getDupontTaxBurdenProvenance } from '@/domainPitMetrics/profitability/dupontTaxBurden/getDupontTaxBurdenProvenance';
import { getDupontInterestBurdenProvenance } from '@/domainPitMetrics/profitability/dupontInterestBurden/getDupontInterestBurdenProvenance';
import { getInventoryTurnoverProvenance } from '@/domainPitMetrics/efficiency/inventoryTurnover/getInventoryTurnoverProvenance';
import { getReceivablesTurnoverProvenance } from '@/domainPitMetrics/efficiency/receivablesTurnover/getReceivablesTurnoverProvenance';
import { getFixedAssetTurnoverProvenance } from '@/domainPitMetrics/efficiency/fixedAssetTurnover/getFixedAssetTurnoverProvenance';
import { getPayablesTurnoverProvenance } from '@/domainPitMetrics/efficiency/payablesTurnover/getPayablesTurnoverProvenance';
import { getInventoryDaysProvenance } from '@/domainPitMetrics/efficiency/inventoryDays/getInventoryDaysProvenance';
import { getReceivablesDaysProvenance } from '@/domainPitMetrics/efficiency/receivablesDays/getReceivablesDaysProvenance';
import { getPayablesDaysProvenance } from '@/domainPitMetrics/efficiency/payablesDays/getPayablesDaysProvenance';
import { getCashConversionCycleProvenance } from '@/domainPitMetrics/efficiency/cashConversionCycle/getCashConversionCycleProvenance';
import { getOperatingCycleProvenance } from '@/domainPitMetrics/efficiency/operatingCycle/getOperatingCycleProvenance';
import { getNetWorkingCapitalTurnoverProvenance } from '@/domainPitMetrics/efficiency/netWorkingCapitalTurnover/getNetWorkingCapitalTurnoverProvenance';
import { getInventoryToRevenueRatioProvenance } from '@/domainPitMetrics/efficiency/inventoryToRevenueRatio/getInventoryToRevenueRatioProvenance';
import { getReceivablesToRevenueRatioProvenance } from '@/domainPitMetrics/efficiency/receivablesToRevenueRatio/getReceivablesToRevenueRatioProvenance';
import { getCapexToRevenueProvenance } from '@/domainPitMetrics/efficiency/capexToRevenue/getCapexToRevenueProvenance';
import { getCapexToOcfRatioProvenance } from '@/domainPitMetrics/efficiency/capexToOcfRatio/getCapexToOcfRatioProvenance';
import { getOperatingExpenseRatioProvenance } from '@/domainPitMetrics/efficiency/operatingExpenseRatio/getOperatingExpenseRatioProvenance';
import { getCurrentRatioProvenance } from '@/domainPitMetrics/resilience/currentRatio/getCurrentRatioProvenance';
import { getQuickRatioProvenance } from '@/domainPitMetrics/resilience/quickRatio/getQuickRatioProvenance';
import { getCashRatioProvenance } from '@/domainPitMetrics/resilience/cashRatio/getCashRatioProvenance';
import { getDebtRatioProvenance } from '@/domainPitMetrics/resilience/debtRatio/getDebtRatioProvenance';
import { getDeRatioProvenance } from '@/domainPitMetrics/resilience/deRatio/getDeRatioProvenance';
import { getEquityRatioProvenance } from '@/domainPitMetrics/resilience/equityRatio/getEquityRatioProvenance';
import { getCashToAssetsRatioProvenance } from '@/domainPitMetrics/resilience/cashToAssetsRatio/getCashToAssetsRatioProvenance';
import { getFinancialLeverageDegreeProvenance } from '@/domainPitMetrics/resilience/financialLeverageDegree/getFinancialLeverageDegreeProvenance';
import { getTotalLeverageDegreeProvenance } from '@/domainPitMetrics/resilience/totalLeverageDegree/getTotalLeverageDegreeProvenance';
import { getInterestCoverageProvenance } from '@/domainPitMetrics/resilience/interestCoverage/getInterestCoverageProvenance';
import { getNetDebtToEbitdaProvenance } from '@/domainPitMetrics/resilience/netDebtToEbitda/getNetDebtToEbitdaProvenance';
import { getNetWorkingCapitalToAssetsProvenance } from '@/domainPitMetrics/resilience/netWorkingCapitalToAssets/getNetWorkingCapitalToAssetsProvenance';
import { getTotalDebtToCapitalProvenance } from '@/domainPitMetrics/resilience/totalDebtToCapital/getTotalDebtToCapitalProvenance';
import { getDebtToFcfProvenance } from '@/domainPitMetrics/resilience/debtToFcf/getDebtToFcfProvenance';
import { getAltmanZDoublePrimeScoreProvenance } from '@/domainPitMetrics/resilience/altmanZDoublePrimeScore/getAltmanZDoublePrimeScoreProvenance';
import { getZmijewskiScoreProvenance } from '@/domainPitMetrics/resilience/zmijewskiScore/getZmijewskiScoreProvenance';
import { getOhlsonOScoreProvenance } from '@/domainPitMetrics/resilience/ohlsonOScore/getOhlsonOScoreProvenance';
import { getEpsProvenance } from '@/domainPitMetrics/profitability/eps/getEpsProvenance';
import { getRevenuePerShareProvenance } from '@/domainPitMetrics/profitability/revenuePerShare/getRevenuePerShareProvenance';
import { getRoaProvenance } from '@/domainPitMetrics/profitability/roa/getRoaProvenance';
import { getNetProfitMarginProvenance } from '@/domainPitMetrics/profitability/netProfitMargin/getNetProfitMarginProvenance';
import { getDupontEbitMarginProvenance } from '@/domainPitMetrics/profitability/dupontEbitMargin/getDupontEbitMarginProvenance';
import { getNovyMarxGpToAssetsProvenance } from '@/domainPitMetrics/profitability/novyMarxGpToAssets/getNovyMarxGpToAssetsProvenance';
import { getNonOperatingIncomeRatioProvenance } from '@/domainPitMetrics/profitability/nonOperatingIncomeRatio/getNonOperatingIncomeRatioProvenance';
import { getCrociProvenance } from '@/domainPitMetrics/profitability/croci/getCrociProvenance';
import { getCroicProvenance } from '@/domainPitMetrics/profitability/croic/getCroicProvenance';
import { getRoicProvenance } from '@/domainPitMetrics/profitability/roic/getRoicProvenance';
import { getRoceProvenance } from '@/domainPitMetrics/profitability/roce/getRoceProvenance';
import { getGreenblattRocProvenance } from '@/domainPitMetrics/profitability/greenblattRoc/getGreenblattRocProvenance';
import { getNissimPenmanRnoaProvenance } from '@/domainPitMetrics/profitability/nissimPenmanRnoa/getNissimPenmanRnoaProvenance';
import { getFamaFrenchOperatingProfitabilityProvenance } from '@/domainPitMetrics/profitability/famaFrenchOperatingProfitability/getFamaFrenchOperatingProfitabilityProvenance';
import { getConsecutiveProfitYearsProvenance } from '@/domainPitMetrics/profitability/consecutiveProfitYears/getConsecutiveProfitYearsProvenance';
import { getGrossMarginProvenance } from '@/domainPitMetrics/profitability/grossMargin/getGrossMarginProvenance';
import { getOperatingMarginProvenance } from '@/domainPitMetrics/profitability/operatingMargin/getOperatingMarginProvenance';
import { PILOT_PROVENANCE_METRIC_CODES, type MetricProvenanceResult } from './provenanceTypes';

// 2026-09-13 從 companies/controller.ts 抽出來——這個 dispatch table 原本跟 controller.ts
// 其餘 15 支 handler 混在一起，每次擴大稽核鏈試點範圍（今天已經做了 13 批）都會讓
// controller.ts 繼續長胖，是那個檔案肥大化的持續來源，不是一次性問題。搬到跟
// provenanceTypes.ts（PILOT_PROVENANCE_METRIC_CODES 的定義處）同一個資料夾，這樣「試點
// 清單」跟「清單對應的實際 resolver」放在一起，之後新增稽核鏈批次只需要動這個檔案，
// 不會再牽動 companies/controller.ts。
//
// metricCode → 對應 resolver 的 dispatch table——之後新增稽核鏈試點指標，只需要在
// PILOT_PROVENANCE_METRIC_CODES（provenanceTypes.ts）加一個值、寫一個對應的
// get<Metric>Provenance.ts、在這裡的 dispatch table 加一行，不需要碰其餘 controller/
// route/openapi/types 邏輯。roe 目前固定用 TTM basis（見 getRoeProvenance.ts 的說明）。
export const PROVENANCE_RESOLVERS: Record<(typeof PILOT_PROVENANCE_METRIC_CODES)[number], (query: QuarterlyMetricQuery) => Promise<MetricProvenanceResult>> = {
  roe: getRoeProvenance,
  chowderNumber: getChowderNumberProvenance,
  sue: getSueProvenance,
  accrualsRatio: getAccrualsRatioProvenance,
  dividendPayoutRatio: getDividendPayoutRatioProvenance,
  altmanZScore: getAltmanZScoreProvenance,
  dupontTaxBurden: getDupontTaxBurdenProvenance,
  dupontInterestBurden: getDupontInterestBurdenProvenance,
  inventoryTurnover: getInventoryTurnoverProvenance,
  receivablesTurnover: getReceivablesTurnoverProvenance,
  fixedAssetTurnover: getFixedAssetTurnoverProvenance,
  payablesTurnover: getPayablesTurnoverProvenance,
  inventoryDays: getInventoryDaysProvenance,
  receivablesDays: getReceivablesDaysProvenance,
  payablesDays: getPayablesDaysProvenance,
  cashConversionCycle: getCashConversionCycleProvenance,
  operatingCycle: getOperatingCycleProvenance,
  netWorkingCapitalTurnover: getNetWorkingCapitalTurnoverProvenance,
  inventoryToRevenueRatio: getInventoryToRevenueRatioProvenance,
  receivablesToRevenueRatio: getReceivablesToRevenueRatioProvenance,
  capexToRevenue: getCapexToRevenueProvenance,
  capexToOcfRatio: getCapexToOcfRatioProvenance,
  operatingExpenseRatio: getOperatingExpenseRatioProvenance,
  currentRatio: getCurrentRatioProvenance,
  quickRatio: getQuickRatioProvenance,
  cashRatio: getCashRatioProvenance,
  debtRatio: getDebtRatioProvenance,
  deRatio: getDeRatioProvenance,
  equityRatio: getEquityRatioProvenance,
  cashToAssetsRatio: getCashToAssetsRatioProvenance,
  financialLeverageDegree: getFinancialLeverageDegreeProvenance,
  totalLeverageDegree: getTotalLeverageDegreeProvenance,
  interestCoverage: getInterestCoverageProvenance,
  netDebtToEbitda: getNetDebtToEbitdaProvenance,
  netWorkingCapitalToAssets: getNetWorkingCapitalToAssetsProvenance,
  totalDebtToCapital: getTotalDebtToCapitalProvenance,
  debtToFcf: getDebtToFcfProvenance,
  altmanZDoublePrimeScore: getAltmanZDoublePrimeScoreProvenance,
  zmijewskiScore: getZmijewskiScoreProvenance,
  ohlsonOScore: getOhlsonOScoreProvenance,
  eps: getEpsProvenance,
  revenuePerShare: getRevenuePerShareProvenance,
  roa: getRoaProvenance,
  netProfitMargin: getNetProfitMarginProvenance,
  dupontEbitMargin: getDupontEbitMarginProvenance,
  novyMarxGpToAssets: getNovyMarxGpToAssetsProvenance,
  nonOperatingIncomeRatio: getNonOperatingIncomeRatioProvenance,
  croci: getCrociProvenance,
  croic: getCroicProvenance,
  roic: getRoicProvenance,
  roce: getRoceProvenance,
  greenblattRoc: getGreenblattRocProvenance,
  nissimPenmanRnoa: getNissimPenmanRnoaProvenance,
  famaFrenchOperatingProfitability: getFamaFrenchOperatingProfitabilityProvenance,
  consecutiveProfitYears: getConsecutiveProfitYearsProvenance,
  grossMargin: getGrossMarginProvenance,
  operatingMargin: getOperatingMarginProvenance,
};
