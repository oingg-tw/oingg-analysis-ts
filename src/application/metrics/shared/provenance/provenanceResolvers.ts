import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { getRoeProvenance } from '@/application/metrics/profitability/roe/getRoeProvenance';
import type { PitDeps } from '@/application/metrics/deps';
import { getChowderNumberProvenance } from '@/application/metrics/dividend/chowderNumber/getChowderNumberProvenance';
import { getSueProvenance } from '@/application/metrics/growth/sue/getSueProvenance';
import { getAccrualsRatioProvenance } from '@/application/metrics/quality/accrualsRatio/getAccrualsRatioProvenance';
import { getDividendPayoutRatioProvenance } from '@/application/metrics/dividend/dividendPayoutRatio/getDividendPayoutRatioProvenance';
import { getAltmanZScoreProvenance } from '@/application/metrics/resilience/altmanZScore/getAltmanZScoreProvenance';
import { getDupontTaxBurdenProvenance } from '@/application/metrics/profitability/dupontTaxBurden/getDupontTaxBurdenProvenance';
import { getDupontInterestBurdenProvenance } from '@/application/metrics/profitability/dupontInterestBurden/getDupontInterestBurdenProvenance';
import { getInventoryTurnoverProvenance } from '@/application/metrics/efficiency/inventoryTurnover/getInventoryTurnoverProvenance';
import { getReceivablesTurnoverProvenance } from '@/application/metrics/efficiency/receivablesTurnover/getReceivablesTurnoverProvenance';
import { getFixedAssetTurnoverProvenance } from '@/application/metrics/efficiency/fixedAssetTurnover/getFixedAssetTurnoverProvenance';
import { getPayablesTurnoverProvenance } from '@/application/metrics/efficiency/payablesTurnover/getPayablesTurnoverProvenance';
import { getInventoryDaysProvenance } from '@/application/metrics/efficiency/inventoryDays/getInventoryDaysProvenance';
import { getReceivablesDaysProvenance } from '@/application/metrics/efficiency/receivablesDays/getReceivablesDaysProvenance';
import { getPayablesDaysProvenance } from '@/application/metrics/efficiency/payablesDays/getPayablesDaysProvenance';
import { getCashConversionCycleProvenance } from '@/application/metrics/efficiency/cashConversionCycle/getCashConversionCycleProvenance';
import { getOperatingCycleProvenance } from '@/application/metrics/efficiency/operatingCycle/getOperatingCycleProvenance';
import { getNetWorkingCapitalTurnoverProvenance } from '@/application/metrics/efficiency/netWorkingCapitalTurnover/getNetWorkingCapitalTurnoverProvenance';
import { getInventoryToRevenueRatioProvenance } from '@/application/metrics/efficiency/inventoryToRevenueRatio/getInventoryToRevenueRatioProvenance';
import { getReceivablesToRevenueRatioProvenance } from '@/application/metrics/efficiency/receivablesToRevenueRatio/getReceivablesToRevenueRatioProvenance';
import { getCapexToRevenueProvenance } from '@/application/metrics/efficiency/capexToRevenue/getCapexToRevenueProvenance';
import { getCapexToOcfRatioProvenance } from '@/application/metrics/efficiency/capexToOcfRatio/getCapexToOcfRatioProvenance';
import { getOperatingExpenseRatioProvenance } from '@/application/metrics/efficiency/operatingExpenseRatio/getOperatingExpenseRatioProvenance';
import { getCurrentRatioProvenance } from '@/application/metrics/resilience/currentRatio/getCurrentRatioProvenance';
import { getQuickRatioProvenance } from '@/application/metrics/resilience/quickRatio/getQuickRatioProvenance';
import { getCashRatioProvenance } from '@/application/metrics/resilience/cashRatio/getCashRatioProvenance';
import { getDebtRatioProvenance } from '@/application/metrics/resilience/debtRatio/getDebtRatioProvenance';
import { getDeRatioProvenance } from '@/application/metrics/resilience/deRatio/getDeRatioProvenance';
import { getLongTermDebtToNetCurrentAssetsProvenance } from '@/application/metrics/resilience/longTermDebtToNetCurrentAssets/getLongTermDebtToNetCurrentAssetsProvenance';
import { getEquityRatioProvenance } from '@/application/metrics/resilience/equityRatio/getEquityRatioProvenance';
import { getCashToAssetsRatioProvenance } from '@/application/metrics/resilience/cashToAssetsRatio/getCashToAssetsRatioProvenance';
import { getFinancialLeverageDegreeProvenance } from '@/application/metrics/resilience/financialLeverageDegree/getFinancialLeverageDegreeProvenance';
import { getTotalLeverageDegreeProvenance } from '@/application/metrics/resilience/totalLeverageDegree/getTotalLeverageDegreeProvenance';
import { getInterestCoverageProvenance } from '@/application/metrics/resilience/interestCoverage/getInterestCoverageProvenance';
import { getNetDebtToEbitdaProvenance } from '@/application/metrics/resilience/netDebtToEbitda/getNetDebtToEbitdaProvenance';
import { getNetWorkingCapitalToAssetsProvenance } from '@/application/metrics/resilience/netWorkingCapitalToAssets/getNetWorkingCapitalToAssetsProvenance';
import { getTotalDebtToCapitalProvenance } from '@/application/metrics/resilience/totalDebtToCapital/getTotalDebtToCapitalProvenance';
import { getDebtToFcfProvenance } from '@/application/metrics/resilience/debtToFcf/getDebtToFcfProvenance';
import { getAltmanZDoublePrimeScoreProvenance } from '@/application/metrics/resilience/altmanZDoublePrimeScore/getAltmanZDoublePrimeScoreProvenance';
import { getZmijewskiScoreProvenance } from '@/application/metrics/resilience/zmijewskiScore/getZmijewskiScoreProvenance';
import { getOhlsonOScoreProvenance } from '@/application/metrics/resilience/ohlsonOScore/getOhlsonOScoreProvenance';
import { getEpsProvenance } from '@/application/metrics/profitability/eps/getEpsProvenance';
import { getPretaxIncomePerShareProvenance } from '@/application/metrics/profitability/pretaxIncomePerShare/getPretaxIncomePerShareProvenance';
import { getRevenuePerShareProvenance } from '@/application/metrics/profitability/revenuePerShare/getRevenuePerShareProvenance';
import { getRoaProvenance } from '@/application/metrics/profitability/roa/getRoaProvenance';
import { getNetProfitMarginProvenance } from '@/application/metrics/profitability/netProfitMargin/getNetProfitMarginProvenance';
import { getDupontEbitMarginProvenance } from '@/application/metrics/profitability/dupontEbitMargin/getDupontEbitMarginProvenance';
import { getNovyMarxGpToAssetsProvenance } from '@/application/metrics/profitability/novyMarxGpToAssets/getNovyMarxGpToAssetsProvenance';
import { getNonOperatingIncomeRatioProvenance } from '@/application/metrics/profitability/nonOperatingIncomeRatio/getNonOperatingIncomeRatioProvenance';
import { getCrociProvenance } from '@/application/metrics/profitability/croci/getCrociProvenance';
import { getCroicProvenance } from '@/application/metrics/profitability/croic/getCroicProvenance';
import { getRoicProvenance } from '@/application/metrics/profitability/roic/getRoicProvenance';
import { getRoceProvenance } from '@/application/metrics/profitability/roce/getRoceProvenance';
import { getGreenblattRocProvenance } from '@/application/metrics/profitability/greenblattRoc/getGreenblattRocProvenance';
import { getNissimPenmanRnoaProvenance } from '@/application/metrics/profitability/nissimPenmanRnoa/getNissimPenmanRnoaProvenance';
import { getFamaFrenchOperatingProfitabilityProvenance } from '@/application/metrics/profitability/famaFrenchOperatingProfitability/getFamaFrenchOperatingProfitabilityProvenance';
import { getConsecutiveProfitYearsProvenance } from '@/application/metrics/quality/consecutiveProfitYears/getConsecutiveProfitYearsProvenance';
import { getGrossMarginProvenance } from '@/application/metrics/profitability/grossMargin/getGrossMarginProvenance';
import { getOperatingMarginProvenance } from '@/application/metrics/profitability/operatingMargin/getOperatingMarginProvenance';
import { getAssetGrowthProvenance } from '@/application/metrics/growth/assetGrowth/getAssetGrowthProvenance';
import { getRevenueGrowthRateProvenance } from '@/application/metrics/growth/revenueGrowthRate/getRevenueGrowthRateProvenance';
import { getNetIncomeGrowthRateProvenance } from '@/application/metrics/growth/netIncomeGrowthRate/getNetIncomeGrowthRateProvenance';
import { getOperatingIncomeGrowthRateProvenance } from '@/application/metrics/growth/operatingIncomeGrowthRate/getOperatingIncomeGrowthRateProvenance';
import { getEquityGrowthRateProvenance } from '@/application/metrics/growth/equityGrowthRate/getEquityGrowthRateProvenance';
import { getBvpsGrowthRateProvenance } from '@/application/metrics/growth/bvpsGrowthRate/getBvpsGrowthRateProvenance';
import { getEpsGrowthRateProvenance } from '@/application/metrics/growth/epsGrowthRate/getEpsGrowthRateProvenance';
import { getRdIntensityProvenance } from '@/application/metrics/growth/rdIntensity/getRdIntensityProvenance';
import { getSgrProvenance } from '@/application/metrics/growth/sgr/getSgrProvenance';
import { getEpsCagrProvenanceForYears } from '@/application/metrics/growth/epsCagr/getEpsCagrProvenance';
import { getRevenueCagrProvenanceForYears } from '@/application/metrics/growth/revenueCagr/getRevenueCagrProvenance';
import { getBuybackYieldProvenance } from '@/application/metrics/dividend/buybackYield/getBuybackYieldProvenance';
import { getConsecutiveDividendYearsProvenance } from '@/application/metrics/dividend/consecutiveDividendYears/getConsecutiveDividendYearsProvenance';
import { getDividendCoverageRatioProvenance } from '@/application/metrics/dividend/dividendCoverageRatio/getDividendCoverageRatioProvenance';
import { getDividendGrowthRateProvenanceForYears } from '@/application/metrics/dividend/dividendGrowthRate/getDividendGrowthRateProvenance';
import { getShareCountChangeRateProvenance } from '@/application/metrics/dividend/shareCountChangeRate/getShareCountChangeRateProvenance';
import { getStockPriceProvenance } from '@/application/metrics/valuation/stockPrice/getStockPriceProvenance';
import { getMarketCapProvenance } from '@/application/metrics/valuation/marketCap/getMarketCapProvenance';
import { getBvpsProvenance } from '@/application/metrics/valuation/bvps/getBvpsProvenance';
import { getPbRatioProvenance } from '@/application/metrics/valuation/pbRatio/getPbRatioProvenance';
import { getPeRatioProvenance } from '@/application/metrics/valuation/peRatio/getPeRatioProvenance';
import { getPsrProvenance } from '@/application/metrics/valuation/psr/getPsrProvenance';
import { getPFcfProvenance } from '@/application/metrics/valuation/pFcf/getPFcfProvenance';
import { getFcfYieldProvenance } from '@/application/metrics/valuation/fcfYield/getFcfYieldProvenance';
import { getNcavProvenance } from '@/application/metrics/valuation/ncav/getNcavProvenance';
import { getEvEbitdaProvenance } from '@/application/metrics/valuation/evEbitda/getEvEbitdaProvenance';
import { getEvToEbitProvenance } from '@/application/metrics/valuation/evToEbit/getEvToEbitProvenance';
import { getEvToFcfProvenance } from '@/application/metrics/valuation/evToFcf/getEvToFcfProvenance';
import { getEvToOcfProvenance } from '@/application/metrics/valuation/evToOcf/getEvToOcfProvenance';
import { getEvToSalesProvenance } from '@/application/metrics/valuation/evToSales/getEvToSalesProvenance';
import { getPriceToOcfProvenance } from '@/application/metrics/valuation/priceToOcf/getPriceToOcfProvenance';
import { getGrahamNumberProvenance } from '@/application/metrics/valuation/grahamNumber/getGrahamNumberProvenance';
import { getEarningsYieldProvenance } from '@/application/metrics/valuation/earningsYield/getEarningsYieldProvenance';
import { getTobinsQProvenance } from '@/application/metrics/valuation/tobinsQ/getTobinsQProvenance';
import { getPegRatioProvenance } from '@/application/metrics/valuation/pegRatio/getPegRatioProvenance';
import { getAbnormalCapexRatioProvenance } from '@/application/metrics/quality/abnormalCapexRatio/getAbnormalCapexRatioProvenance';
import { getBeneishAqiProvenance } from '@/application/metrics/quality/beneishAqi/getBeneishAqiProvenance';
import { getBeneishDsriProvenance } from '@/application/metrics/quality/beneishDsri/getBeneishDsriProvenance';
import { getBeneishMScoreProvenance } from '@/application/metrics/quality/beneishMScore/getBeneishMScoreProvenance';
import { getFcfConversionRateProvenance } from '@/application/metrics/quality/fcfConversionRate/getFcfConversionRateProvenance';
import { getFcfMarginProvenance } from '@/application/metrics/quality/fcfMargin/getFcfMarginProvenance';
import { getFcfPerShareProvenance } from '@/application/metrics/quality/fcfPerShare/getFcfPerShareProvenance';
import { getOcfMarginProvenance } from '@/application/metrics/quality/ocfMargin/getOcfMarginProvenance';
import { getOcfPerShareProvenance } from '@/application/metrics/quality/ocfPerShare/getOcfPerShareProvenance';
import { getDepreciationAmortizationPerShareProvenance } from '@/application/metrics/quality/depreciationAmortizationPerShare/getDepreciationAmortizationPerShareProvenance';
import { getOcfToNetIncomeProvenance } from '@/application/metrics/quality/ocfToNetIncome/getOcfToNetIncomeProvenance';
import { getOwnerEarningsProvenance } from '@/application/metrics/quality/ownerEarnings/getOwnerEarningsProvenance';
import { getEarningsToRecordHighProvenance } from '@/application/metrics/growth/earningsToRecordHigh/getEarningsToRecordHighProvenance';
import { getThreeMarginsRisingProvenance } from '@/application/metrics/growth/threeMarginsRising/getThreeMarginsRisingProvenance';
import { getShareholderYieldProvenance } from '@/application/metrics/dividend/shareholderYield/getShareholderYieldProvenance';
import { getAssetTurnoverProvenance } from '@/application/metrics/efficiency/assetTurnover/getAssetTurnoverProvenance';
import { getEquityMultiplierProvenance } from '@/application/metrics/resilience/equityMultiplier/getEquityMultiplierProvenance';
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
export type ProvenanceResolvers = Record<(typeof PILOT_PROVENANCE_METRIC_CODES)[number], (query: QuarterlyMetricQuery) => Promise<MetricProvenanceResult>>;

// 2026-09-17 Phase 4：dispatch table 改成工廠——deps 由 bootstrap（或測試的 fakes）注入，遷移期間的 legacyBridge 已刪除。
export const createProvenanceResolvers = (deps: PitDeps): ProvenanceResolvers => ({
  roe: (query) => getRoeProvenance(query, deps),
  chowderNumber: (query) => getChowderNumberProvenance(query, deps),
  sue: (query) => getSueProvenance(query, deps),
  accrualsRatio: (query) => getAccrualsRatioProvenance(query, deps),
  dividendPayoutRatio: (query) => getDividendPayoutRatioProvenance(query, deps),
  altmanZScore: (query) => getAltmanZScoreProvenance(query, deps),
  dupontTaxBurden: (query) => getDupontTaxBurdenProvenance(query, deps),
  dupontInterestBurden: (query) => getDupontInterestBurdenProvenance(query, deps),
  inventoryTurnover: (query) => getInventoryTurnoverProvenance(query, deps),
  receivablesTurnover: (query) => getReceivablesTurnoverProvenance(query, deps),
  fixedAssetTurnover: (query) => getFixedAssetTurnoverProvenance(query, deps),
  payablesTurnover: (query) => getPayablesTurnoverProvenance(query, deps),
  inventoryDays: (query) => getInventoryDaysProvenance(query, deps),
  receivablesDays: (query) => getReceivablesDaysProvenance(query, deps),
  payablesDays: (query) => getPayablesDaysProvenance(query, deps),
  cashConversionCycle: (query) => getCashConversionCycleProvenance(query, deps),
  operatingCycle: (query) => getOperatingCycleProvenance(query, deps),
  netWorkingCapitalTurnover: (query) => getNetWorkingCapitalTurnoverProvenance(query, deps),
  inventoryToRevenueRatio: (query) => getInventoryToRevenueRatioProvenance(query, deps),
  receivablesToRevenueRatio: (query) => getReceivablesToRevenueRatioProvenance(query, deps),
  capexToRevenue: (query) => getCapexToRevenueProvenance(query, deps),
  capexToOcfRatio: (query) => getCapexToOcfRatioProvenance(query, deps),
  operatingExpenseRatio: (query) => getOperatingExpenseRatioProvenance(query, deps),
  currentRatio: (query) => getCurrentRatioProvenance(query, deps),
  quickRatio: (query) => getQuickRatioProvenance(query, deps),
  cashRatio: (query) => getCashRatioProvenance(query, deps),
  debtRatio: (query) => getDebtRatioProvenance(query, deps),
  deRatio: (query) => getDeRatioProvenance(query, deps),
  longTermDebtToNetCurrentAssets: (query) => getLongTermDebtToNetCurrentAssetsProvenance(query, deps),
  equityRatio: (query) => getEquityRatioProvenance(query, deps),
  cashToAssetsRatio: (query) => getCashToAssetsRatioProvenance(query, deps),
  financialLeverageDegree: (query) => getFinancialLeverageDegreeProvenance(query, deps),
  totalLeverageDegree: (query) => getTotalLeverageDegreeProvenance(query, deps),
  interestCoverage: (query) => getInterestCoverageProvenance(query, deps),
  netDebtToEbitda: (query) => getNetDebtToEbitdaProvenance(query, deps),
  netWorkingCapitalToAssets: (query) => getNetWorkingCapitalToAssetsProvenance(query, deps),
  totalDebtToCapital: (query) => getTotalDebtToCapitalProvenance(query, deps),
  debtToFcf: (query) => getDebtToFcfProvenance(query, deps),
  altmanZDoublePrimeScore: (query) => getAltmanZDoublePrimeScoreProvenance(query, deps),
  zmijewskiScore: (query) => getZmijewskiScoreProvenance(query, deps),
  ohlsonOScore: (query) => getOhlsonOScoreProvenance(query, deps),
  eps: (query) => getEpsProvenance(query, deps),
  pretaxIncomePerShare: (query) => getPretaxIncomePerShareProvenance(query, deps),
  revenuePerShare: (query) => getRevenuePerShareProvenance(query, deps),
  roa: (query) => getRoaProvenance(query, deps),
  netProfitMargin: (query) => getNetProfitMarginProvenance(query, deps),
  dupontEbitMargin: (query) => getDupontEbitMarginProvenance(query, deps),
  novyMarxGpToAssets: (query) => getNovyMarxGpToAssetsProvenance(query, deps),
  nonOperatingIncomeRatio: (query) => getNonOperatingIncomeRatioProvenance(query, deps),
  croci: (query) => getCrociProvenance(query, deps),
  croic: (query) => getCroicProvenance(query, deps),
  roic: (query) => getRoicProvenance(query, deps),
  roce: (query) => getRoceProvenance(query, deps),
  greenblattRoc: (query) => getGreenblattRocProvenance(query, deps),
  nissimPenmanRnoa: (query) => getNissimPenmanRnoaProvenance(query, deps),
  famaFrenchOperatingProfitability: (query) => getFamaFrenchOperatingProfitabilityProvenance(query, deps),
  consecutiveProfitYears: (query) => getConsecutiveProfitYearsProvenance(query, deps),
  grossMargin: (query) => getGrossMarginProvenance(query, deps),
  operatingMargin: (query) => getOperatingMarginProvenance(query, deps),
  assetGrowth: (query) => getAssetGrowthProvenance(query, deps),
  revenueGrowthRate: (query) => getRevenueGrowthRateProvenance(query, deps),
  netIncomeGrowthRate: (query) => getNetIncomeGrowthRateProvenance(query, deps),
  operatingIncomeGrowthRate: (query) => getOperatingIncomeGrowthRateProvenance(query, deps),
  equityGrowthRate: (query) => getEquityGrowthRateProvenance(query, deps),
  bvpsGrowthRate: (query) => getBvpsGrowthRateProvenance(query, deps),
  epsGrowthRate: (query) => getEpsGrowthRateProvenance(query, deps),
  rdIntensity: (query) => getRdIntensityProvenance(query, deps),
  sgr: (query) => getSgrProvenance(query, deps),
  epsCagr3y: getEpsCagrProvenanceForYears(3, deps),
  epsCagr5y: getEpsCagrProvenanceForYears(5, deps),
  epsCagr8y: getEpsCagrProvenanceForYears(8, deps),
  revenueCagr3y: getRevenueCagrProvenanceForYears(3, deps),
  revenueCagr5y: getRevenueCagrProvenanceForYears(5, deps),
  revenueCagr8y: getRevenueCagrProvenanceForYears(8, deps),
  buybackYield: (query) => getBuybackYieldProvenance(query, deps),
  consecutiveDividendYears: (query) => getConsecutiveDividendYearsProvenance(query, deps),
  dividendCoverageRatio: (query) => getDividendCoverageRatioProvenance(query, deps),
  dividendGrowthRate3y: getDividendGrowthRateProvenanceForYears(3, deps),
  dividendGrowthRate5y: getDividendGrowthRateProvenanceForYears(5, deps),
  dividendGrowthRate8y: getDividendGrowthRateProvenanceForYears(8, deps),
  shareCountChangeRate: (query) => getShareCountChangeRateProvenance(query, deps),
  stockPrice: (query) => getStockPriceProvenance(query, deps),
  marketCap: (query) => getMarketCapProvenance(query, deps),
  bvps: (query) => getBvpsProvenance(query, deps),
  pbRatio: (query) => getPbRatioProvenance(query, deps),
  peRatio: (query) => getPeRatioProvenance(query, deps),
  psr: (query) => getPsrProvenance(query, deps),
  pFcf: (query) => getPFcfProvenance(query, deps),
  fcfYield: (query) => getFcfYieldProvenance(query, deps),
  ncav: (query) => getNcavProvenance(query, deps),
  evEbitda: (query) => getEvEbitdaProvenance(query, deps),
  evToEbit: (query) => getEvToEbitProvenance(query, deps),
  evToFcf: (query) => getEvToFcfProvenance(query, deps),
  evToOcf: (query) => getEvToOcfProvenance(query, deps),
  evToSales: (query) => getEvToSalesProvenance(query, deps),
  priceToOcf: (query) => getPriceToOcfProvenance(query, deps),
  grahamNumber: (query) => getGrahamNumberProvenance(query, deps),
  earningsYield: (query) => getEarningsYieldProvenance(query, deps),
  tobinsQ: (query) => getTobinsQProvenance(query, deps),
  pegRatio: (query) => getPegRatioProvenance(query, deps),
  abnormalCapexRatio: (query) => getAbnormalCapexRatioProvenance(query, deps),
  beneishAqi: (query) => getBeneishAqiProvenance(query, deps),
  beneishDsri: (query) => getBeneishDsriProvenance(query, deps),
  beneishMScore: (query) => getBeneishMScoreProvenance(query, deps),
  fcfConversionRate: (query) => getFcfConversionRateProvenance(query, deps),
  fcfMargin: (query) => getFcfMarginProvenance(query, deps),
  fcfPerShare: (query) => getFcfPerShareProvenance(query, deps),
  ocfMargin: (query) => getOcfMarginProvenance(query, deps),
  ocfPerShare: (query) => getOcfPerShareProvenance(query, deps),
  depreciationAmortizationPerShare: (query) => getDepreciationAmortizationPerShareProvenance(query, deps),
  ocfToNetIncome: (query) => getOcfToNetIncomeProvenance(query, deps),
  ownerEarnings: (query) => getOwnerEarningsProvenance(query, deps),
  earningsToRecordHigh: (query) => getEarningsToRecordHighProvenance(query, deps),
  threeMarginsRising: (query) => getThreeMarginsRisingProvenance(query, deps),
  shareholderYield: (query) => getShareholderYieldProvenance(query, deps),
  assetTurnover: (query) => getAssetTurnoverProvenance(query, deps),
  equityMultiplier: (query) => getEquityMultiplierProvenance(query, deps),
});
