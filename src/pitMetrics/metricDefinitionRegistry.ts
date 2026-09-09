import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { legacyAllowedArrays, type MetricDefinitionSpec } from './metricDefinitionSpec';
import { roeDefinition } from '@/pitMetrics/profitability/roe/roeDefinition';
import { roaDefinition } from '@/pitMetrics/profitability/roa/roaDefinition';
import { netProfitMarginDefinition } from '@/pitMetrics/profitability/netProfitMargin/netProfitMarginDefinition';
import { assetTurnoverDefinition } from '@/pitMetrics/efficiency/assetTurnover/assetTurnoverDefinition';
import { equityMultiplierDefinition } from '@/pitMetrics/resilience/equityMultiplier/equityMultiplierDefinition';
import { dupontDecomposedRoeDefinition } from '@/pitMetrics/profitability/dupontDecomposedRoe/dupontDecomposedRoeDefinition';
import { dupontTaxBurdenDefinition } from '@/pitMetrics/profitability/dupontTaxBurden/dupontTaxBurdenDefinition';
import { dupontInterestBurdenDefinition } from '@/pitMetrics/profitability/dupontInterestBurden/dupontInterestBurdenDefinition';
import { dupontEbitMarginDefinition } from '@/pitMetrics/profitability/dupontEbitMargin/dupontEbitMarginDefinition';
import { dupontExtendedRoeDefinition } from '@/pitMetrics/profitability/dupontExtendedRoe/dupontExtendedRoeDefinition';
import { epsDefinition } from '@/pitMetrics/profitability/eps/epsDefinition';
import { bvpsDefinition } from '@/pitMetrics/valuation/bvps/bvpsDefinition';
import { peRatioDefinition } from '@/pitMetrics/valuation/peRatio/peRatioDefinition';
import { pbRatioDefinition } from '@/pitMetrics/valuation/pbRatio/pbRatioDefinition';
import { stockPriceDefinition } from '@/pitMetrics/valuation/stockPrice/stockPriceDefinition';
import { revenuePerShareDefinition } from '@/pitMetrics/profitability/revenuePerShare/revenuePerShareDefinition';
import { dividendPayoutRatioDefinition } from '@/pitMetrics/dividend/dividendPayoutRatio/dividendPayoutRatioDefinition';
import { sgrDefinition } from '@/pitMetrics/growth/sgr/sgrDefinition';
import { ocfPerShareDefinition } from '@/pitMetrics/quality/ocfPerShare/ocfPerShareDefinition';
import { fcfPerShareDefinition } from '@/pitMetrics/quality/fcfPerShare/fcfPerShareDefinition';
import { ocfToNetIncomeDefinition } from '@/pitMetrics/quality/ocfToNetIncome/ocfToNetIncomeDefinition';
import { accrualsRatioDefinition } from '@/pitMetrics/quality/accrualsRatio/accrualsRatioDefinition';
import { debtRatioDefinition } from '@/pitMetrics/resilience/debtRatio/debtRatioDefinition';
import { currentRatioDefinition } from '@/pitMetrics/resilience/currentRatio/currentRatioDefinition';
import { quickRatioDefinition } from '@/pitMetrics/resilience/quickRatio/quickRatioDefinition';
import { cashRatioDefinition } from '@/pitMetrics/resilience/cashRatio/cashRatioDefinition';
import { deRatioDefinition } from '@/pitMetrics/resilience/deRatio/deRatioDefinition';
import { interestCoverageDefinition } from '@/pitMetrics/resilience/interestCoverage/interestCoverageDefinition';
import { netDebtToEbitdaDefinition } from '@/pitMetrics/resilience/netDebtToEbitda/netDebtToEbitdaDefinition';
import { capexToRevenueDefinition } from '@/pitMetrics/efficiency/capexToRevenue/capexToRevenueDefinition';
import { psrDefinition } from '@/pitMetrics/valuation/psr/psrDefinition';
import { pFcfDefinition } from '@/pitMetrics/valuation/pFcf/pFcfDefinition';
import { evEbitdaDefinition } from '@/pitMetrics/valuation/evEbitda/evEbitdaDefinition';
import { roicDefinition } from '@/pitMetrics/profitability/roic/roicDefinition';
import { roceDefinition } from '@/pitMetrics/profitability/roce/roceDefinition';
import { grossMarginDefinition } from '@/pitMetrics/profitability/grossMargin/grossMarginDefinition';
import { operatingMarginDefinition } from '@/pitMetrics/profitability/operatingMargin/operatingMarginDefinition';
import { inventoryTurnoverDefinition } from '@/pitMetrics/efficiency/inventoryTurnover/inventoryTurnoverDefinition';
import { receivablesTurnoverDefinition } from '@/pitMetrics/efficiency/receivablesTurnover/receivablesTurnoverDefinition';
import { fixedAssetTurnoverDefinition } from '@/pitMetrics/efficiency/fixedAssetTurnover/fixedAssetTurnoverDefinition';
import { payablesTurnoverDefinition } from '@/pitMetrics/efficiency/payablesTurnover/payablesTurnoverDefinition';
import { inventoryDaysDefinition } from '@/pitMetrics/efficiency/inventoryDays/inventoryDaysDefinition';
import { receivablesDaysDefinition } from '@/pitMetrics/efficiency/receivablesDays/receivablesDaysDefinition';
import { payablesDaysDefinition } from '@/pitMetrics/efficiency/payablesDays/payablesDaysDefinition';
import { cashConversionCycleDefinition } from '@/pitMetrics/efficiency/cashConversionCycle/cashConversionCycleDefinition';
import { grahamNumberDefinition } from '@/pitMetrics/valuation/grahamNumber/grahamNumberDefinition';
import { ncavDefinition } from '@/pitMetrics/valuation/ncav/ncavDefinition';
import { ownerEarningsDefinition } from '@/pitMetrics/quality/ownerEarnings/ownerEarningsDefinition';
import { altmanZScoreDefinition } from '@/pitMetrics/resilience/altmanZScore/altmanZScoreDefinition';
import { piotroskiFScoreDefinition } from '@/pitMetrics/quality/piotroskiFScore/piotroskiFScoreDefinition';
import { beneishMScoreDefinition } from '@/pitMetrics/quality/beneishMScore/beneishMScoreDefinition';
import { nissimPenmanRnoaDefinition } from '@/pitMetrics/profitability/nissimPenmanRnoa/nissimPenmanRnoaDefinition';
import { zmijewskiScoreDefinition } from '@/pitMetrics/resilience/zmijewskiScore/zmijewskiScoreDefinition';
import { ohlsonOScoreDefinition } from '@/pitMetrics/resilience/ohlsonOScore/ohlsonOScoreDefinition';
import { fcfYieldDefinition } from '@/pitMetrics/valuation/fcfYield/fcfYieldDefinition';
import { bankNplRatioDefinition } from '@/pitMetrics/resilience/bankNplRatio/bankNplRatioDefinition';
import { bankNplCoverageRatioDefinition } from '@/pitMetrics/resilience/bankNplCoverageRatio/bankNplCoverageRatioDefinition';
import { bankCarRatioDefinition } from '@/pitMetrics/resilience/bankCarRatio/bankCarRatioDefinition';
import { bankCet1RatioDefinition } from '@/pitMetrics/resilience/bankCet1Ratio/bankCet1RatioDefinition';
import { bankTier1RatioDefinition } from '@/pitMetrics/resilience/bankTier1Ratio/bankTier1RatioDefinition';
import { exchangePeRatioDefinition } from '@/pitMetrics/valuation/exchangePeRatio/exchangePeRatioDefinition';
import { exchangePbRatioDefinition } from '@/pitMetrics/valuation/exchangePbRatio/exchangePbRatioDefinition';
import { dividendYieldDefinition } from '@/pitMetrics/dividend/dividendYield/dividendYieldDefinition';
import { betaDefinition } from '@/pitMetrics/valuation/beta/betaDefinition';

// 程式碼中的宣告式 registry（docs/analysis-ts-spec-v0.2.md §6.3）；DB 的 metric_definitions
// 一列從這裡 upsert 出去，避免兩邊各自維護一份定義而漂移。命名避開裸的 `registry`——
// src/adapters/swagger/registry.ts 已經有一個完全不同語意的 OpenAPIRegistry 實例叫這個名字。
//
// 2026-09-09 拆檔：每個 metricCode 的完整定義（displayName/unit/formulaNote/group/
// allowedXxx/dependsOn/currentFormulaVersion）已經搬到它自己的資料夾
// （src/pitMetrics/<分類>/<metricCode>/<metricCode>Definition.ts），跟計算邏輯
// （calculateXxx.ts/computeXxxPit.ts）放在一起——這個檔案縮成純彙整：import 全部
// 定義、組成下面這個 Record，跟 upsertMetricDefinition() 這個唯一需要碰 DB 的函式。
// 型別本身（MetricDefinitionSpec）跟 legacyAllowedArrays() adapter 移到
// metricDefinitionSpec.ts，避免 64 個定義檔案 import 型別時形成循環依賴。
export const metricDefinitionRegistry: Record<string, MetricDefinitionSpec> = {
  roe: roeDefinition,
  roa: roaDefinition,
  netProfitMargin: netProfitMarginDefinition,
  assetTurnover: assetTurnoverDefinition,
  equityMultiplier: equityMultiplierDefinition,
  dupontDecomposedRoe: dupontDecomposedRoeDefinition,
  dupontTaxBurden: dupontTaxBurdenDefinition,
  dupontInterestBurden: dupontInterestBurdenDefinition,
  dupontEbitMargin: dupontEbitMarginDefinition,
  dupontExtendedRoe: dupontExtendedRoeDefinition,
  eps: epsDefinition,
  bvps: bvpsDefinition,
  peRatio: peRatioDefinition,
  pbRatio: pbRatioDefinition,
  stockPrice: stockPriceDefinition,
  revenuePerShare: revenuePerShareDefinition,
  dividendPayoutRatio: dividendPayoutRatioDefinition,
  sgr: sgrDefinition,
  ocfPerShare: ocfPerShareDefinition,
  fcfPerShare: fcfPerShareDefinition,
  ocfToNetIncome: ocfToNetIncomeDefinition,
  accrualsRatio: accrualsRatioDefinition,
  debtRatio: debtRatioDefinition,
  currentRatio: currentRatioDefinition,
  quickRatio: quickRatioDefinition,
  cashRatio: cashRatioDefinition,
  deRatio: deRatioDefinition,
  interestCoverage: interestCoverageDefinition,
  netDebtToEbitda: netDebtToEbitdaDefinition,
  capexToRevenue: capexToRevenueDefinition,
  psr: psrDefinition,
  pFcf: pFcfDefinition,
  evEbitda: evEbitdaDefinition,
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
  grahamNumber: grahamNumberDefinition,
  ncav: ncavDefinition,
  ownerEarnings: ownerEarningsDefinition,
  altmanZScore: altmanZScoreDefinition,
  piotroskiFScore: piotroskiFScoreDefinition,
  beneishMScore: beneishMScoreDefinition,
  nissimPenmanRnoa: nissimPenmanRnoaDefinition,
  zmijewskiScore: zmijewskiScoreDefinition,
  ohlsonOScore: ohlsonOScoreDefinition,
  fcfYield: fcfYieldDefinition,
  bankNplRatio: bankNplRatioDefinition,
  bankNplCoverageRatio: bankNplCoverageRatioDefinition,
  bankCarRatio: bankCarRatioDefinition,
  bankCet1Ratio: bankCet1RatioDefinition,
  bankTier1Ratio: bankTier1RatioDefinition,
  exchangePeRatio: exchangePeRatioDefinition,
  exchangePbRatio: exchangePbRatioDefinition,
  dividendYield: dividendYieldDefinition,
  beta: betaDefinition,
};

// 冪等，backfill 腳本開跑前呼叫一次即可。metric_definitions 表的外部形狀（四陣列並排）
// 維持不變，用 legacyAllowedArrays() 從 discriminated union 展開，不用另外重寫一次
// switch。
export const upsertMetricDefinition = async (spec: MetricDefinitionSpec): Promise<void> => {
  // allowedRollingWindowTokens 特意不解構進去——那個欄位純粹是 registry 內部用的
  // token 白名單，metric_definitions 表從來沒有對應欄位（DB 這張表本來就不是執行期
  // 讀取路徑，見這個檔案上方 model 說明），只有四個 allowedXxx 陣列會實際寫進去。
  const { allowedPeriodTypes, allowedLookbackRanges, allowedSamplingIntervals, allowedSnapshotCadences } = legacyAllowedArrays(spec);
  const allowed = { allowedPeriodTypes, allowedLookbackRanges, allowedSamplingIntervals, allowedSnapshotCadences };
  await analysisPrisma.metricDefinition.upsert({
    where: { metricCode: spec.metricCode },
    create: {
      metricCode: spec.metricCode,
      formulaNote: spec.formulaNote,
      ...allowed,
      dependsOn: spec.dependsOn,
      currentFormulaVersion: spec.currentFormulaVersion,
    },
    update: {
      formulaNote: spec.formulaNote,
      ...allowed,
      dependsOn: spec.dependsOn,
      currentFormulaVersion: spec.currentFormulaVersion,
    },
  });
};
