import type { MetricDefinitionSpec } from '../../domain/metrics/metricDefinitionSpec';
import { roeDefinition } from '@/domain/metrics/profitability/roe/roeDefinition';
import { novyMarxGpToAssetsDefinition } from '@/domain/metrics/profitability/novyMarxGpToAssets/novyMarxGpToAssetsDefinition';
import { crociDefinition } from '@/domain/metrics/profitability/croci/crociDefinition';
import { roaDefinition } from '@/domain/metrics/profitability/roa/roaDefinition';
import { netProfitMarginDefinition } from '@/domain/metrics/profitability/netProfitMargin/netProfitMarginDefinition';
import { assetTurnoverDefinition } from '@/domain/metrics/efficiency/assetTurnover/assetTurnoverDefinition';
import { operatingExpenseRatioDefinition } from '@/domain/metrics/efficiency/operatingExpenseRatio/operatingExpenseRatioDefinition';
import { equityMultiplierDefinition } from '@/domain/metrics/resilience/equityMultiplier/equityMultiplierDefinition';
import { dupontDecomposedRoeDefinition } from '@/domain/metrics/profitability/dupontDecomposedRoe/dupontDecomposedRoeDefinition';
import { dupontTaxBurdenDefinition } from '@/domain/metrics/profitability/dupontTaxBurden/dupontTaxBurdenDefinition';
import { dupontInterestBurdenDefinition } from '@/domain/metrics/profitability/dupontInterestBurden/dupontInterestBurdenDefinition';
import { dupontEbitMarginDefinition } from '@/domain/metrics/profitability/dupontEbitMargin/dupontEbitMarginDefinition';
import { dupontExtendedRoeDefinition } from '@/domain/metrics/profitability/dupontExtendedRoe/dupontExtendedRoeDefinition';
import { epsDefinition } from '@/domain/metrics/profitability/eps/epsDefinition';
import { pretaxIncomePerShareDefinition } from '@/domain/metrics/profitability/pretaxIncomePerShare/pretaxIncomePerShareDefinition';
import { bvpsDefinition } from '@/domain/metrics/valuation/bvps/bvpsDefinition';
import { peRatioDefinition } from '@/domain/metrics/valuation/peRatio/peRatioDefinition';
import { pegRatioDefinition } from '@/domain/metrics/valuation/pegRatio/pegRatioDefinition';
import { pbRatioDefinition } from '@/domain/metrics/valuation/pbRatio/pbRatioDefinition';
import { stockPriceDefinition } from '@/domain/metrics/valuation/stockPrice/stockPriceDefinition';
import { marketCapDefinition } from '@/domain/metrics/valuation/marketCap/marketCapDefinition';
import { tobinsQDefinition } from '@/domain/metrics/valuation/tobinsQ/tobinsQDefinition';
// 2026-09-15：神奇公式（Magic Formula Investing）上線，greenblattEarningsYield
// 重新曝露成獨立指標（2026-09-14 當時決定「先不要單獨曝露，等神奇公式上線再一起合併」，
// 現在就是那個時機），跟 magicFormulaRank 一起註冊。
import { greenblattRocDefinition } from '@/domain/metrics/profitability/greenblattRoc/greenblattRocDefinition';
import { greenblattEarningsYieldDefinition } from '@/domain/metrics/valuation/greenblattEarningsYield/greenblattEarningsYieldDefinition';
import { magicFormulaRankDefinition } from '@/domain/metrics/valuation/magicFormulaRank/magicFormulaRankDefinition';
import { revenuePerShareDefinition } from '@/domain/metrics/profitability/revenuePerShare/revenuePerShareDefinition';
import { dividendPayoutRatioDefinition } from '@/domain/metrics/dividend/dividendPayoutRatio/dividendPayoutRatioDefinition';
import { dividendPerShareDefinition } from '@/domain/metrics/dividend/dividendPerShare/dividendPerShareDefinition';
import { grossProfitPerShareDefinition } from '@/domain/metrics/profitability/grossProfitPerShare/grossProfitPerShareDefinition';
import { operatingIncomePerShareDefinition } from '@/domain/metrics/profitability/operatingIncomePerShare/operatingIncomePerShareDefinition';
import { consecutiveDividendYearsDefinition } from '@/domain/metrics/dividend/consecutiveDividendYears/consecutiveDividendYearsDefinition';
import { dividendDistributionCountDefinition } from '@/domain/metrics/dividend/dividendDistributionCount/dividendDistributionCountDefinition';
import { dividendGrowthRateFamilyDefinitions } from '@/domain/metrics/dividend/dividendGrowthRate/dividendGrowthRateDefinition';
import { chowderNumberDefinition } from '@/domain/metrics/dividend/chowderNumber/chowderNumberDefinition';
import { revenueCagrFamilyDefinitions } from '@/domain/metrics/growth/revenueCagr/revenueCagrDefinition';
import { oneDollarTestDefinition } from '@/domain/metrics/profitability/oneDollarTest/oneDollarTestDefinition';
import { epsCagrFamilyDefinitions } from '@/domain/metrics/growth/epsCagr/epsCagrDefinition';
import { buybackYieldDefinition } from '@/domain/metrics/dividend/buybackYield/buybackYieldDefinition';
import { dividendCoverageRatioDefinition } from '@/domain/metrics/dividend/dividendCoverageRatio/dividendCoverageRatioDefinition';
import { shareholderYieldDefinition } from '@/domain/metrics/dividend/shareholderYield/shareholderYieldDefinition';
import { shareCountChangeRateDefinition } from '@/domain/metrics/dividend/shareCountChangeRate/shareCountChangeRateDefinition';
import { sgrDefinition } from '@/domain/metrics/growth/sgr/sgrDefinition';
import { revenueGrowthRateDefinition } from '@/domain/metrics/growth/revenueGrowthRate/revenueGrowthRateDefinition';
import { ruleOf40Definition } from '@/domain/metrics/growth/ruleOf40/ruleOf40Definition';
import { epsGrowthRateDefinition } from '@/domain/metrics/growth/epsGrowthRate/epsGrowthRateDefinition';
import { netIncomeGrowthRateDefinition } from '@/domain/metrics/growth/netIncomeGrowthRate/netIncomeGrowthRateDefinition';
import { operatingIncomeGrowthRateDefinition } from '@/domain/metrics/growth/operatingIncomeGrowthRate/operatingIncomeGrowthRateDefinition';
import { equityGrowthRateDefinition } from '@/domain/metrics/growth/equityGrowthRate/equityGrowthRateDefinition';
import { bvpsGrowthRateDefinition } from '@/domain/metrics/growth/bvpsGrowthRate/bvpsGrowthRateDefinition';
import { assetGrowthDefinition } from '@/domain/metrics/growth/assetGrowth/assetGrowthDefinition';
import { rdIntensityDefinition } from '@/domain/metrics/growth/rdIntensity/rdIntensityDefinition';
import { sueDefinition } from '@/domain/metrics/growth/sue/sueDefinition';
import { consecutiveProfitYearsDefinition } from '@/domain/metrics/quality/consecutiveProfitYears/consecutiveProfitYearsDefinition';
import { earningsYieldDefinition } from '@/domain/metrics/valuation/earningsYield/earningsYieldDefinition';
import { ocfPerShareDefinition } from '@/domain/metrics/quality/ocfPerShare/ocfPerShareDefinition';
import { fcfPerShareDefinition } from '@/domain/metrics/quality/fcfPerShare/fcfPerShareDefinition';
import { depreciationAmortizationPerShareDefinition } from '@/domain/metrics/quality/depreciationAmortizationPerShare/depreciationAmortizationPerShareDefinition';
import { ocfToNetIncomeDefinition } from '@/domain/metrics/quality/ocfToNetIncome/ocfToNetIncomeDefinition';
import { accrualsRatioDefinition } from '@/domain/metrics/quality/accrualsRatio/accrualsRatioDefinition';
import { fcfMarginDefinition } from '@/domain/metrics/quality/fcfMargin/fcfMarginDefinition';
import { abnormalCapexRatioDefinition } from '@/domain/metrics/quality/abnormalCapexRatio/abnormalCapexRatioDefinition';
import { debtRatioDefinition } from '@/domain/metrics/resilience/debtRatio/debtRatioDefinition';
import { netWorkingCapitalToAssetsDefinition } from '@/domain/metrics/resilience/netWorkingCapitalToAssets/netWorkingCapitalToAssetsDefinition';
import { totalDebtToCapitalDefinition } from '@/domain/metrics/resilience/totalDebtToCapital/totalDebtToCapitalDefinition';
import { currentRatioDefinition } from '@/domain/metrics/resilience/currentRatio/currentRatioDefinition';
import { quickRatioDefinition } from '@/domain/metrics/resilience/quickRatio/quickRatioDefinition';
import { cashRatioDefinition } from '@/domain/metrics/resilience/cashRatio/cashRatioDefinition';
import { deRatioDefinition } from '@/domain/metrics/resilience/deRatio/deRatioDefinition';
import { longTermDebtToNetCurrentAssetsDefinition } from '@/domain/metrics/resilience/longTermDebtToNetCurrentAssets/longTermDebtToNetCurrentAssetsDefinition';
import { interestCoverageDefinition } from '@/domain/metrics/resilience/interestCoverage/interestCoverageDefinition';
import { netDebtToEbitdaDefinition } from '@/domain/metrics/resilience/netDebtToEbitda/netDebtToEbitdaDefinition';
import { capexToRevenueDefinition } from '@/domain/metrics/efficiency/capexToRevenue/capexToRevenueDefinition';
import { psrDefinition } from '@/domain/metrics/valuation/psr/psrDefinition';
import { pFcfDefinition } from '@/domain/metrics/valuation/pFcf/pFcfDefinition';
import { evEbitdaDefinition } from '@/domain/metrics/valuation/evEbitda/evEbitdaDefinition';
import { evToEbitDefinition } from '@/domain/metrics/valuation/evToEbit/evToEbitDefinition';
import { evToFcfDefinition } from '@/domain/metrics/valuation/evToFcf/evToFcfDefinition';
import { priceToResearchRatioDefinition } from '@/domain/metrics/growth/priceToResearchRatio/priceToResearchRatioDefinition';
import { roicDefinition } from '@/domain/metrics/profitability/roic/roicDefinition';
import { roceDefinition } from '@/domain/metrics/profitability/roce/roceDefinition';
import { grossMarginDefinition } from '@/domain/metrics/profitability/grossMargin/grossMarginDefinition';
import { operatingMarginDefinition } from '@/domain/metrics/profitability/operatingMargin/operatingMarginDefinition';
import { inventoryTurnoverDefinition } from '@/domain/metrics/efficiency/inventoryTurnover/inventoryTurnoverDefinition';
import { receivablesTurnoverDefinition } from '@/domain/metrics/efficiency/receivablesTurnover/receivablesTurnoverDefinition';
import { fixedAssetTurnoverDefinition } from '@/domain/metrics/efficiency/fixedAssetTurnover/fixedAssetTurnoverDefinition';
import { payablesTurnoverDefinition } from '@/domain/metrics/efficiency/payablesTurnover/payablesTurnoverDefinition';
import { inventoryDaysDefinition } from '@/domain/metrics/efficiency/inventoryDays/inventoryDaysDefinition';
import { receivablesDaysDefinition } from '@/domain/metrics/efficiency/receivablesDays/receivablesDaysDefinition';
import { payablesDaysDefinition } from '@/domain/metrics/efficiency/payablesDays/payablesDaysDefinition';
import { cashConversionCycleDefinition } from '@/domain/metrics/efficiency/cashConversionCycle/cashConversionCycleDefinition';
import { operatingCycleDefinition } from '@/domain/metrics/efficiency/operatingCycle/operatingCycleDefinition';
import { netWorkingCapitalTurnoverDefinition } from '@/domain/metrics/efficiency/netWorkingCapitalTurnover/netWorkingCapitalTurnoverDefinition';
import { inventoryToRevenueRatioDefinition } from '@/domain/metrics/efficiency/inventoryToRevenueRatio/inventoryToRevenueRatioDefinition';
import { receivablesToRevenueRatioDefinition } from '@/domain/metrics/efficiency/receivablesToRevenueRatio/receivablesToRevenueRatioDefinition';
import { capexToOcfRatioDefinition } from '@/domain/metrics/efficiency/capexToOcfRatio/capexToOcfRatioDefinition';
import { evToOcfDefinition } from '@/domain/metrics/valuation/evToOcf/evToOcfDefinition';
import { evToSalesDefinition } from '@/domain/metrics/valuation/evToSales/evToSalesDefinition';
import { priceToOcfDefinition } from '@/domain/metrics/valuation/priceToOcf/priceToOcfDefinition';
import { debtToFcfDefinition } from '@/domain/metrics/resilience/debtToFcf/debtToFcfDefinition';
import { croicDefinition } from '@/domain/metrics/profitability/croic/croicDefinition';
import { ocfMarginDefinition } from '@/domain/metrics/quality/ocfMargin/ocfMarginDefinition';
import { fcfConversionRateDefinition } from '@/domain/metrics/quality/fcfConversionRate/fcfConversionRateDefinition';
import { financialLeverageDegreeDefinition } from '@/domain/metrics/resilience/financialLeverageDegree/financialLeverageDegreeDefinition';
import { totalLeverageDegreeDefinition } from '@/domain/metrics/resilience/totalLeverageDegree/totalLeverageDegreeDefinition';
import { nonOperatingIncomeRatioDefinition } from '@/domain/metrics/profitability/nonOperatingIncomeRatio/nonOperatingIncomeRatioDefinition';
import { equityRatioDefinition } from '@/domain/metrics/resilience/equityRatio/equityRatioDefinition';
import { cashToAssetsRatioDefinition } from '@/domain/metrics/resilience/cashToAssetsRatio/cashToAssetsRatioDefinition';
import { grahamNumberDefinition } from '@/domain/metrics/valuation/grahamNumber/grahamNumberDefinition';
import { ncavDefinition } from '@/domain/metrics/valuation/ncav/ncavDefinition';
import { ownerEarningsDefinition } from '@/domain/metrics/quality/ownerEarnings/ownerEarningsDefinition';
import { altmanZScoreDefinition } from '@/domain/metrics/resilience/altmanZScore/altmanZScoreDefinition';
import { altmanZDoublePrimeScoreDefinition } from '@/domain/metrics/resilience/altmanZDoublePrimeScore/altmanZDoublePrimeScoreDefinition';
import { piotroskiFScoreDefinition } from '@/domain/metrics/quality/piotroskiFScore/piotroskiFScoreDefinition';
import { beneishMScoreDefinition } from '@/domain/metrics/quality/beneishMScore/beneishMScoreDefinition';
import { beneishAqiDefinition } from '@/domain/metrics/quality/beneishAqi/beneishAqiDefinition';
import { beneishDsriDefinition } from '@/domain/metrics/quality/beneishDsri/beneishDsriDefinition';
import { nissimPenmanRnoaDefinition } from '@/domain/metrics/profitability/nissimPenmanRnoa/nissimPenmanRnoaDefinition';
import { zmijewskiScoreDefinition } from '@/domain/metrics/resilience/zmijewskiScore/zmijewskiScoreDefinition';
import { ohlsonOScoreDefinition } from '@/domain/metrics/resilience/ohlsonOScore/ohlsonOScoreDefinition';
import { fcfYieldDefinition } from '@/domain/metrics/valuation/fcfYield/fcfYieldDefinition';
import { bankNplRatioDefinition } from '@/domain/metrics/resilience/bankNplRatio/bankNplRatioDefinition';
import { bankNplCoverageRatioDefinition } from '@/domain/metrics/resilience/bankNplCoverageRatio/bankNplCoverageRatioDefinition';
import { bankCarRatioDefinition } from '@/domain/metrics/resilience/bankCarRatio/bankCarRatioDefinition';
import { bankCet1RatioDefinition } from '@/domain/metrics/resilience/bankCet1Ratio/bankCet1RatioDefinition';
import { bankTier1RatioDefinition } from '@/domain/metrics/resilience/bankTier1Ratio/bankTier1RatioDefinition';
import { bankNetInterestIncomePerShareDefinition } from '@/domain/metrics/profitability/bankNetInterestIncomePerShare/bankNetInterestIncomePerShareDefinition';
import { bankNetNonInterestIncomePerShareDefinition } from '@/domain/metrics/profitability/bankNetNonInterestIncomePerShare/bankNetNonInterestIncomePerShareDefinition';
import { bankBadDebtProvisionPerShareDefinition } from '@/domain/metrics/profitability/bankBadDebtProvisionPerShare/bankBadDebtProvisionPerShareDefinition';
import { bankOtherOperatingExpensePerShareDefinition } from '@/domain/metrics/profitability/bankOtherOperatingExpensePerShare/bankOtherOperatingExpensePerShareDefinition';
import { exchangePeRatioDefinition } from '@/domain/metrics/valuation/exchangePeRatio/exchangePeRatioDefinition';
import { exchangePbRatioDefinition } from '@/domain/metrics/valuation/exchangePbRatio/exchangePbRatioDefinition';
import { dividendYieldDefinition } from '@/domain/metrics/dividend/dividendYield/dividendYieldDefinition';
import { liveGrahamNumberDefinition } from '@/domain/metrics/valuation/liveGrahamNumber/liveGrahamNumberDefinition';
import { livePegRatioDefinition } from '@/domain/metrics/valuation/livePegRatio/livePegRatioDefinition';
import { liveMarketCapDefinition } from '@/domain/metrics/valuation/liveMarketCap/liveMarketCapDefinition';
import { betaDefinition } from '@/domain/metrics/valuation/beta/betaDefinition';
import { famaFrenchOperatingProfitabilityDefinition } from '@/domain/metrics/profitability/famaFrenchOperatingProfitability/famaFrenchOperatingProfitabilityDefinition';

// 程式碼中的宣告式 registry（docs/analysis-ts-spec-v0.2.md §6.3）；DB 的 metric_definitions
// 一列從這裡 upsert 出去，避免兩邊各自維護一份定義而漂移。命名避開裸的 `registry`——
// src/adapters/swagger/registry.ts 已經有一個完全不同語意的 OpenAPIRegistry 實例叫這個名字。
//
// 2026-09-09 拆檔：每個 metricCode 的完整定義（name/unit/formulaNote/group/
// allowedXxx/dependsOn/currentFormulaVersion）已經搬到它自己的資料夾
// （src/domainPitMetrics/<分類>/<metricCode>/<metricCode>Definition.ts），跟計算邏輯
// （calculateXxx.ts/computeXxxPit.ts）放在一起——這個檔案縮成純彙整：import 全部
// 定義、組成下面這個 Record，跟 upsertMetricDefinition() 這個唯一需要碰 DB 的函式。
// 型別本身（MetricDefinitionSpec）跟 legacyAllowedArrays() adapter 移到
// metricDefinitionSpec.ts，避免 64 個定義檔案 import 型別時形成循環依賴。
export const metricDefinitionRegistry: Record<string, MetricDefinitionSpec> = {
  roe: roeDefinition,
  novyMarxGpToAssets: novyMarxGpToAssetsDefinition,
  croci: crociDefinition,
  consecutiveProfitYears: consecutiveProfitYearsDefinition,
  roa: roaDefinition,
  netProfitMargin: netProfitMarginDefinition,
  assetTurnover: assetTurnoverDefinition,
  operatingExpenseRatio: operatingExpenseRatioDefinition,
  equityMultiplier: equityMultiplierDefinition,
  dupontDecomposedRoe: dupontDecomposedRoeDefinition,
  dupontTaxBurden: dupontTaxBurdenDefinition,
  dupontInterestBurden: dupontInterestBurdenDefinition,
  dupontEbitMargin: dupontEbitMarginDefinition,
  dupontExtendedRoe: dupontExtendedRoeDefinition,
  eps: epsDefinition,
  pretaxIncomePerShare: pretaxIncomePerShareDefinition,
  grossProfitPerShare: grossProfitPerShareDefinition,
  operatingIncomePerShare: operatingIncomePerShareDefinition,
  bvps: bvpsDefinition,
  peRatio: peRatioDefinition,
  pegRatio: pegRatioDefinition,
  earningsYield: earningsYieldDefinition,
  pbRatio: pbRatioDefinition,
  stockPrice: stockPriceDefinition,
  marketCap: marketCapDefinition,
  tobinsQ: tobinsQDefinition,
  greenblattRoc: greenblattRocDefinition,
  greenblattEarningsYield: greenblattEarningsYieldDefinition,
  magicFormulaRank: magicFormulaRankDefinition,
  revenuePerShare: revenuePerShareDefinition,
  dividendPayoutRatio: dividendPayoutRatioDefinition,
  dividendPerShare: dividendPerShareDefinition,
  consecutiveDividendYears: consecutiveDividendYearsDefinition,
  dividendDistributionCount: dividendDistributionCountDefinition,
  ...dividendGrowthRateFamilyDefinitions,
  chowderNumber: chowderNumberDefinition,
  buybackYield: buybackYieldDefinition,
  dividendCoverageRatio: dividendCoverageRatioDefinition,
  shareholderYield: shareholderYieldDefinition,
  shareCountChangeRate: shareCountChangeRateDefinition,
  sgr: sgrDefinition,
  revenueGrowthRate: revenueGrowthRateDefinition,
  ruleOf40: ruleOf40Definition,
  epsGrowthRate: epsGrowthRateDefinition,
  netIncomeGrowthRate: netIncomeGrowthRateDefinition,
  operatingIncomeGrowthRate: operatingIncomeGrowthRateDefinition,
  equityGrowthRate: equityGrowthRateDefinition,
  bvpsGrowthRate: bvpsGrowthRateDefinition,
  assetGrowth: assetGrowthDefinition,
  rdIntensity: rdIntensityDefinition,
  sue: sueDefinition,
  ...revenueCagrFamilyDefinitions,
  oneDollarTest: oneDollarTestDefinition,
  ...epsCagrFamilyDefinitions,
  ocfPerShare: ocfPerShareDefinition,
  fcfPerShare: fcfPerShareDefinition,
  depreciationAmortizationPerShare: depreciationAmortizationPerShareDefinition,
  ocfToNetIncome: ocfToNetIncomeDefinition,
  accrualsRatio: accrualsRatioDefinition,
  fcfMargin: fcfMarginDefinition,
  abnormalCapexRatio: abnormalCapexRatioDefinition,
  debtRatio: debtRatioDefinition,
  netWorkingCapitalToAssets: netWorkingCapitalToAssetsDefinition,
  totalDebtToCapital: totalDebtToCapitalDefinition,
  currentRatio: currentRatioDefinition,
  quickRatio: quickRatioDefinition,
  cashRatio: cashRatioDefinition,
  deRatio: deRatioDefinition,
  longTermDebtToNetCurrentAssets: longTermDebtToNetCurrentAssetsDefinition,
  interestCoverage: interestCoverageDefinition,
  netDebtToEbitda: netDebtToEbitdaDefinition,
  capexToRevenue: capexToRevenueDefinition,
  psr: psrDefinition,
  pFcf: pFcfDefinition,
  evEbitda: evEbitdaDefinition,
  evToEbit: evToEbitDefinition,
  evToFcf: evToFcfDefinition,
  priceToResearchRatio: priceToResearchRatioDefinition,
  roic: roicDefinition,
  roce: roceDefinition,
  grossMargin: grossMarginDefinition,
  operatingMargin: operatingMarginDefinition,
  inventoryTurnover: inventoryTurnoverDefinition,
  receivablesTurnover: receivablesTurnoverDefinition,
  fixedAssetTurnover: fixedAssetTurnoverDefinition,
  payablesTurnover: payablesTurnoverDefinition,
  inventoryDays: inventoryDaysDefinition,
  receivablesDays: receivablesDaysDefinition,
  payablesDays: payablesDaysDefinition,
  cashConversionCycle: cashConversionCycleDefinition,
  operatingCycle: operatingCycleDefinition,
  netWorkingCapitalTurnover: netWorkingCapitalTurnoverDefinition,
  inventoryToRevenueRatio: inventoryToRevenueRatioDefinition,
  receivablesToRevenueRatio: receivablesToRevenueRatioDefinition,
  capexToOcfRatio: capexToOcfRatioDefinition,
  evToOcf: evToOcfDefinition,
  evToSales: evToSalesDefinition,
  priceToOcf: priceToOcfDefinition,
  debtToFcf: debtToFcfDefinition,
  croic: croicDefinition,
  ocfMargin: ocfMarginDefinition,
  fcfConversionRate: fcfConversionRateDefinition,
  financialLeverageDegree: financialLeverageDegreeDefinition,
  totalLeverageDegree: totalLeverageDegreeDefinition,
  nonOperatingIncomeRatio: nonOperatingIncomeRatioDefinition,
  equityRatio: equityRatioDefinition,
  cashToAssetsRatio: cashToAssetsRatioDefinition,
  grahamNumber: grahamNumberDefinition,
  ncav: ncavDefinition,
  ownerEarnings: ownerEarningsDefinition,
  altmanZScore: altmanZScoreDefinition,
  altmanZDoublePrimeScore: altmanZDoublePrimeScoreDefinition,
  piotroskiFScore: piotroskiFScoreDefinition,
  beneishMScore: beneishMScoreDefinition,
  beneishAqi: beneishAqiDefinition,
  beneishDsri: beneishDsriDefinition,
  nissimPenmanRnoa: nissimPenmanRnoaDefinition,
  zmijewskiScore: zmijewskiScoreDefinition,
  ohlsonOScore: ohlsonOScoreDefinition,
  fcfYield: fcfYieldDefinition,
  bankNplRatio: bankNplRatioDefinition,
  bankNplCoverageRatio: bankNplCoverageRatioDefinition,
  bankCarRatio: bankCarRatioDefinition,
  bankCet1Ratio: bankCet1RatioDefinition,
  bankTier1Ratio: bankTier1RatioDefinition,
  bankNetInterestIncomePerShare: bankNetInterestIncomePerShareDefinition,
  bankNetNonInterestIncomePerShare: bankNetNonInterestIncomePerShareDefinition,
  bankBadDebtProvisionPerShare: bankBadDebtProvisionPerShareDefinition,
  bankOtherOperatingExpensePerShare: bankOtherOperatingExpensePerShareDefinition,
  exchangePeRatio: exchangePeRatioDefinition,
  exchangePbRatio: exchangePbRatioDefinition,
  dividendYield: dividendYieldDefinition,
  liveGrahamNumber: liveGrahamNumberDefinition,
  livePegRatio: livePegRatioDefinition,
  liveMarketCap: liveMarketCapDefinition,
  beta: betaDefinition,
  famaFrenchOperatingProfitability: famaFrenchOperatingProfitabilityDefinition,
};

// 2026-09-17 重構 Phase 2：metric_definitions 的 upsert 搬到 infrastructure/repositories/analysis/
// metricDefinitionRepository.ts（registry 本身從此不碰 Prisma）；Phase 4 起 backfill 腳本/測試改從
// src/bootstrap/metricDefinitions.ts 拿 upsertMetricDefinition，這裡不再 re-export infrastructure。
