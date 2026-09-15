import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { MetricDefinitionSpec } from './metricDefinitionSpec';
import { roeDefinition } from '@/domainPitMetrics/profitability/roe/roeDefinition';
import { novyMarxGpToAssetsDefinition } from '@/domainPitMetrics/profitability/novyMarxGpToAssets/novyMarxGpToAssetsDefinition';
import { crociDefinition } from '@/domainPitMetrics/profitability/croci/crociDefinition';
import { roaDefinition } from '@/domainPitMetrics/profitability/roa/roaDefinition';
import { netProfitMarginDefinition } from '@/domainPitMetrics/profitability/netProfitMargin/netProfitMarginDefinition';
import { assetTurnoverDefinition } from '@/domainPitMetrics/efficiency/assetTurnover/assetTurnoverDefinition';
import { operatingExpenseRatioDefinition } from '@/domainPitMetrics/efficiency/operatingExpenseRatio/operatingExpenseRatioDefinition';
import { equityMultiplierDefinition } from '@/domainPitMetrics/resilience/equityMultiplier/equityMultiplierDefinition';
import { dupontDecomposedRoeDefinition } from '@/domainPitMetrics/profitability/dupontDecomposedRoe/dupontDecomposedRoeDefinition';
import { dupontTaxBurdenDefinition } from '@/domainPitMetrics/profitability/dupontTaxBurden/dupontTaxBurdenDefinition';
import { dupontInterestBurdenDefinition } from '@/domainPitMetrics/profitability/dupontInterestBurden/dupontInterestBurdenDefinition';
import { dupontEbitMarginDefinition } from '@/domainPitMetrics/profitability/dupontEbitMargin/dupontEbitMarginDefinition';
import { dupontExtendedRoeDefinition } from '@/domainPitMetrics/profitability/dupontExtendedRoe/dupontExtendedRoeDefinition';
import { epsDefinition } from '@/domainPitMetrics/profitability/eps/epsDefinition';
import { pretaxIncomePerShareDefinition } from '@/domainPitMetrics/profitability/pretaxIncomePerShare/pretaxIncomePerShareDefinition';
import { bvpsDefinition } from '@/domainPitMetrics/valuation/bvps/bvpsDefinition';
import { peRatioDefinition } from '@/domainPitMetrics/valuation/peRatio/peRatioDefinition';
import { pegRatioDefinition } from '@/domainPitMetrics/valuation/pegRatio/pegRatioDefinition';
import { pbRatioDefinition } from '@/domainPitMetrics/valuation/pbRatio/pbRatioDefinition';
import { stockPriceDefinition } from '@/domainPitMetrics/valuation/stockPrice/stockPriceDefinition';
import { marketCapDefinition } from '@/domainPitMetrics/valuation/marketCap/marketCapDefinition';
import { tobinsQDefinition } from '@/domainPitMetrics/valuation/tobinsQ/tobinsQDefinition';
// 2026-09-14 使用者要求：greenblattEarningsYield 先不要單獨曝露成獨立指標，等神奇公式
// （Magic Formula Investing，greenblattRoc + greenblattEarningsYield 排名合併）上線時
// 再一起合併進去。compute*Pit.ts/Definition.ts/getProvenance.ts 檔案都還在（之後神奇
// 公式要用），只是先不註冊進這份 registry——writeMetricValue() 對未註冊的 metricCode
// 會直接 rejected，不會意外寫入；GET /metrics 等端點也都是動態查這份 registry，不用
// 額外處理曝露邏輯，拿掉這行 import/註冊就是唯一要做的事。
import { greenblattRocDefinition } from '@/domainPitMetrics/profitability/greenblattRoc/greenblattRocDefinition';
import { revenuePerShareDefinition } from '@/domainPitMetrics/profitability/revenuePerShare/revenuePerShareDefinition';
import { dividendPayoutRatioDefinition } from '@/domainPitMetrics/dividend/dividendPayoutRatio/dividendPayoutRatioDefinition';
import { consecutiveDividendYearsDefinition } from '@/domainPitMetrics/dividend/consecutiveDividendYears/consecutiveDividendYearsDefinition';
import { dividendGrowthRateFamilyDefinitions } from '@/domainPitMetrics/dividend/dividendGrowthRate/dividendGrowthRateDefinition';
import { chowderNumberDefinition } from '@/domainPitMetrics/dividend/chowderNumber/chowderNumberDefinition';
import { revenueCagrFamilyDefinitions } from '@/domainPitMetrics/growth/revenueCagr/revenueCagrDefinition';
import { oneDollarTestDefinition } from '@/domainPitMetrics/profitability/oneDollarTest/oneDollarTestDefinition';
import { epsCagrFamilyDefinitions } from '@/domainPitMetrics/growth/epsCagr/epsCagrDefinition';
import { buybackYieldDefinition } from '@/domainPitMetrics/dividend/buybackYield/buybackYieldDefinition';
import { dividendCoverageRatioDefinition } from '@/domainPitMetrics/dividend/dividendCoverageRatio/dividendCoverageRatioDefinition';
import { shareholderYieldDefinition } from '@/domainPitMetrics/dividend/shareholderYield/shareholderYieldDefinition';
import { shareCountChangeRateDefinition } from '@/domainPitMetrics/dividend/shareCountChangeRate/shareCountChangeRateDefinition';
import { sgrDefinition } from '@/domainPitMetrics/growth/sgr/sgrDefinition';
import { revenueGrowthRateDefinition } from '@/domainPitMetrics/growth/revenueGrowthRate/revenueGrowthRateDefinition';
import { ruleOf40Definition } from '@/domainPitMetrics/growth/ruleOf40/ruleOf40Definition';
import { epsGrowthRateDefinition } from '@/domainPitMetrics/growth/epsGrowthRate/epsGrowthRateDefinition';
import { netIncomeGrowthRateDefinition } from '@/domainPitMetrics/growth/netIncomeGrowthRate/netIncomeGrowthRateDefinition';
import { operatingIncomeGrowthRateDefinition } from '@/domainPitMetrics/growth/operatingIncomeGrowthRate/operatingIncomeGrowthRateDefinition';
import { equityGrowthRateDefinition } from '@/domainPitMetrics/growth/equityGrowthRate/equityGrowthRateDefinition';
import { bvpsGrowthRateDefinition } from '@/domainPitMetrics/growth/bvpsGrowthRate/bvpsGrowthRateDefinition';
import { assetGrowthDefinition } from '@/domainPitMetrics/growth/assetGrowth/assetGrowthDefinition';
import { rdIntensityDefinition } from '@/domainPitMetrics/growth/rdIntensity/rdIntensityDefinition';
import { sueDefinition } from '@/domainPitMetrics/growth/sue/sueDefinition';
import { consecutiveProfitYearsDefinition } from '@/domainPitMetrics/quality/consecutiveProfitYears/consecutiveProfitYearsDefinition';
import { earningsYieldDefinition } from '@/domainPitMetrics/valuation/earningsYield/earningsYieldDefinition';
import { ocfPerShareDefinition } from '@/domainPitMetrics/quality/ocfPerShare/ocfPerShareDefinition';
import { fcfPerShareDefinition } from '@/domainPitMetrics/quality/fcfPerShare/fcfPerShareDefinition';
import { depreciationAmortizationPerShareDefinition } from '@/domainPitMetrics/quality/depreciationAmortizationPerShare/depreciationAmortizationPerShareDefinition';
import { ocfToNetIncomeDefinition } from '@/domainPitMetrics/quality/ocfToNetIncome/ocfToNetIncomeDefinition';
import { accrualsRatioDefinition } from '@/domainPitMetrics/quality/accrualsRatio/accrualsRatioDefinition';
import { fcfMarginDefinition } from '@/domainPitMetrics/quality/fcfMargin/fcfMarginDefinition';
import { abnormalCapexRatioDefinition } from '@/domainPitMetrics/quality/abnormalCapexRatio/abnormalCapexRatioDefinition';
import { debtRatioDefinition } from '@/domainPitMetrics/resilience/debtRatio/debtRatioDefinition';
import { netWorkingCapitalToAssetsDefinition } from '@/domainPitMetrics/resilience/netWorkingCapitalToAssets/netWorkingCapitalToAssetsDefinition';
import { totalDebtToCapitalDefinition } from '@/domainPitMetrics/resilience/totalDebtToCapital/totalDebtToCapitalDefinition';
import { currentRatioDefinition } from '@/domainPitMetrics/resilience/currentRatio/currentRatioDefinition';
import { quickRatioDefinition } from '@/domainPitMetrics/resilience/quickRatio/quickRatioDefinition';
import { cashRatioDefinition } from '@/domainPitMetrics/resilience/cashRatio/cashRatioDefinition';
import { deRatioDefinition } from '@/domainPitMetrics/resilience/deRatio/deRatioDefinition';
import { longTermDebtToNetCurrentAssetsDefinition } from '@/domainPitMetrics/resilience/longTermDebtToNetCurrentAssets/longTermDebtToNetCurrentAssetsDefinition';
import { interestCoverageDefinition } from '@/domainPitMetrics/resilience/interestCoverage/interestCoverageDefinition';
import { netDebtToEbitdaDefinition } from '@/domainPitMetrics/resilience/netDebtToEbitda/netDebtToEbitdaDefinition';
import { capexToRevenueDefinition } from '@/domainPitMetrics/efficiency/capexToRevenue/capexToRevenueDefinition';
import { psrDefinition } from '@/domainPitMetrics/valuation/psr/psrDefinition';
import { pFcfDefinition } from '@/domainPitMetrics/valuation/pFcf/pFcfDefinition';
import { evEbitdaDefinition } from '@/domainPitMetrics/valuation/evEbitda/evEbitdaDefinition';
import { evToEbitDefinition } from '@/domainPitMetrics/valuation/evToEbit/evToEbitDefinition';
import { evToFcfDefinition } from '@/domainPitMetrics/valuation/evToFcf/evToFcfDefinition';
import { priceToResearchRatioDefinition } from '@/domainPitMetrics/growth/priceToResearchRatio/priceToResearchRatioDefinition';
import { roicDefinition } from '@/domainPitMetrics/profitability/roic/roicDefinition';
import { roceDefinition } from '@/domainPitMetrics/profitability/roce/roceDefinition';
import { grossMarginDefinition } from '@/domainPitMetrics/profitability/grossMargin/grossMarginDefinition';
import { operatingMarginDefinition } from '@/domainPitMetrics/profitability/operatingMargin/operatingMarginDefinition';
import { inventoryTurnoverDefinition } from '@/domainPitMetrics/efficiency/inventoryTurnover/inventoryTurnoverDefinition';
import { receivablesTurnoverDefinition } from '@/domainPitMetrics/efficiency/receivablesTurnover/receivablesTurnoverDefinition';
import { fixedAssetTurnoverDefinition } from '@/domainPitMetrics/efficiency/fixedAssetTurnover/fixedAssetTurnoverDefinition';
import { payablesTurnoverDefinition } from '@/domainPitMetrics/efficiency/payablesTurnover/payablesTurnoverDefinition';
import { inventoryDaysDefinition } from '@/domainPitMetrics/efficiency/inventoryDays/inventoryDaysDefinition';
import { receivablesDaysDefinition } from '@/domainPitMetrics/efficiency/receivablesDays/receivablesDaysDefinition';
import { payablesDaysDefinition } from '@/domainPitMetrics/efficiency/payablesDays/payablesDaysDefinition';
import { cashConversionCycleDefinition } from '@/domainPitMetrics/efficiency/cashConversionCycle/cashConversionCycleDefinition';
import { operatingCycleDefinition } from '@/domainPitMetrics/efficiency/operatingCycle/operatingCycleDefinition';
import { netWorkingCapitalTurnoverDefinition } from '@/domainPitMetrics/efficiency/netWorkingCapitalTurnover/netWorkingCapitalTurnoverDefinition';
import { inventoryToRevenueRatioDefinition } from '@/domainPitMetrics/efficiency/inventoryToRevenueRatio/inventoryToRevenueRatioDefinition';
import { receivablesToRevenueRatioDefinition } from '@/domainPitMetrics/efficiency/receivablesToRevenueRatio/receivablesToRevenueRatioDefinition';
import { capexToOcfRatioDefinition } from '@/domainPitMetrics/efficiency/capexToOcfRatio/capexToOcfRatioDefinition';
import { evToOcfDefinition } from '@/domainPitMetrics/valuation/evToOcf/evToOcfDefinition';
import { evToSalesDefinition } from '@/domainPitMetrics/valuation/evToSales/evToSalesDefinition';
import { priceToOcfDefinition } from '@/domainPitMetrics/valuation/priceToOcf/priceToOcfDefinition';
import { debtToFcfDefinition } from '@/domainPitMetrics/resilience/debtToFcf/debtToFcfDefinition';
import { croicDefinition } from '@/domainPitMetrics/profitability/croic/croicDefinition';
import { ocfMarginDefinition } from '@/domainPitMetrics/quality/ocfMargin/ocfMarginDefinition';
import { fcfConversionRateDefinition } from '@/domainPitMetrics/quality/fcfConversionRate/fcfConversionRateDefinition';
import { financialLeverageDegreeDefinition } from '@/domainPitMetrics/resilience/financialLeverageDegree/financialLeverageDegreeDefinition';
import { totalLeverageDegreeDefinition } from '@/domainPitMetrics/resilience/totalLeverageDegree/totalLeverageDegreeDefinition';
import { nonOperatingIncomeRatioDefinition } from '@/domainPitMetrics/profitability/nonOperatingIncomeRatio/nonOperatingIncomeRatioDefinition';
import { equityRatioDefinition } from '@/domainPitMetrics/resilience/equityRatio/equityRatioDefinition';
import { cashToAssetsRatioDefinition } from '@/domainPitMetrics/resilience/cashToAssetsRatio/cashToAssetsRatioDefinition';
import { grahamNumberDefinition } from '@/domainPitMetrics/valuation/grahamNumber/grahamNumberDefinition';
import { ncavDefinition } from '@/domainPitMetrics/valuation/ncav/ncavDefinition';
import { ownerEarningsDefinition } from '@/domainPitMetrics/quality/ownerEarnings/ownerEarningsDefinition';
import { altmanZScoreDefinition } from '@/domainPitMetrics/resilience/altmanZScore/altmanZScoreDefinition';
import { altmanZDoublePrimeScoreDefinition } from '@/domainPitMetrics/resilience/altmanZDoublePrimeScore/altmanZDoublePrimeScoreDefinition';
import { piotroskiFScoreDefinition } from '@/domainPitMetrics/quality/piotroskiFScore/piotroskiFScoreDefinition';
import { beneishMScoreDefinition } from '@/domainPitMetrics/quality/beneishMScore/beneishMScoreDefinition';
import { beneishAqiDefinition } from '@/domainPitMetrics/quality/beneishAqi/beneishAqiDefinition';
import { beneishDsriDefinition } from '@/domainPitMetrics/quality/beneishDsri/beneishDsriDefinition';
import { nissimPenmanRnoaDefinition } from '@/domainPitMetrics/profitability/nissimPenmanRnoa/nissimPenmanRnoaDefinition';
import { zmijewskiScoreDefinition } from '@/domainPitMetrics/resilience/zmijewskiScore/zmijewskiScoreDefinition';
import { ohlsonOScoreDefinition } from '@/domainPitMetrics/resilience/ohlsonOScore/ohlsonOScoreDefinition';
import { fcfYieldDefinition } from '@/domainPitMetrics/valuation/fcfYield/fcfYieldDefinition';
import { bankNplRatioDefinition } from '@/domainPitMetrics/resilience/bankNplRatio/bankNplRatioDefinition';
import { bankNplCoverageRatioDefinition } from '@/domainPitMetrics/resilience/bankNplCoverageRatio/bankNplCoverageRatioDefinition';
import { bankCarRatioDefinition } from '@/domainPitMetrics/resilience/bankCarRatio/bankCarRatioDefinition';
import { bankCet1RatioDefinition } from '@/domainPitMetrics/resilience/bankCet1Ratio/bankCet1RatioDefinition';
import { bankTier1RatioDefinition } from '@/domainPitMetrics/resilience/bankTier1Ratio/bankTier1RatioDefinition';
import { bankNetInterestIncomePerShareDefinition } from '@/domainPitMetrics/profitability/bankNetInterestIncomePerShare/bankNetInterestIncomePerShareDefinition';
import { bankNetNonInterestIncomePerShareDefinition } from '@/domainPitMetrics/profitability/bankNetNonInterestIncomePerShare/bankNetNonInterestIncomePerShareDefinition';
import { bankBadDebtProvisionPerShareDefinition } from '@/domainPitMetrics/profitability/bankBadDebtProvisionPerShare/bankBadDebtProvisionPerShareDefinition';
import { bankOtherOperatingExpensePerShareDefinition } from '@/domainPitMetrics/profitability/bankOtherOperatingExpensePerShare/bankOtherOperatingExpensePerShareDefinition';
import { exchangePeRatioDefinition } from '@/domainPitMetrics/valuation/exchangePeRatio/exchangePeRatioDefinition';
import { exchangePbRatioDefinition } from '@/domainPitMetrics/valuation/exchangePbRatio/exchangePbRatioDefinition';
import { dividendYieldDefinition } from '@/domainPitMetrics/dividend/dividendYield/dividendYieldDefinition';
import { liveGrahamNumberDefinition } from '@/domainPitMetrics/valuation/liveGrahamNumber/liveGrahamNumberDefinition';
import { livePegRatioDefinition } from '@/domainPitMetrics/valuation/livePegRatio/livePegRatioDefinition';
import { liveMarketCapDefinition } from '@/domainPitMetrics/valuation/liveMarketCap/liveMarketCapDefinition';
import { betaDefinition } from '@/domainPitMetrics/valuation/beta/betaDefinition';
import { famaFrenchOperatingProfitabilityDefinition } from '@/domainPitMetrics/profitability/famaFrenchOperatingProfitability/famaFrenchOperatingProfitabilityDefinition';

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
  bvps: bvpsDefinition,
  peRatio: peRatioDefinition,
  pegRatio: pegRatioDefinition,
  earningsYield: earningsYieldDefinition,
  pbRatio: pbRatioDefinition,
  stockPrice: stockPriceDefinition,
  marketCap: marketCapDefinition,
  tobinsQ: tobinsQDefinition,
  greenblattRoc: greenblattRocDefinition,
  revenuePerShare: revenuePerShareDefinition,
  dividendPayoutRatio: dividendPayoutRatioDefinition,
  consecutiveDividendYears: consecutiveDividendYearsDefinition,
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

// 冪等，backfill 腳本開跑前呼叫一次即可。2026-09-09 起 metric_definitions 只有一個
// spec JSON 欄位，直接存整個 MetricDefinitionSpec——不用再做任何形狀轉換（原本的
// legacyAllowedArrays() adapter 已經整個刪除，這是它唯一的消費端）。
export const upsertMetricDefinition = async (spec: MetricDefinitionSpec): Promise<void> => {
  await analysisPrisma.metricDefinition.upsert({
    where: { metricCode: spec.metricCode },
    create: { metricCode: spec.metricCode, spec },
    update: { spec },
  });
};
