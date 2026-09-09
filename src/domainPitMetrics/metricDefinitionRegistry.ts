import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { MetricDefinitionSpec } from './metricDefinitionSpec';
import { roeDefinition } from '@/domainPitMetrics/profitability/roe/roeDefinition';
import { roaDefinition } from '@/domainPitMetrics/profitability/roa/roaDefinition';
import { netProfitMarginDefinition } from '@/domainPitMetrics/profitability/netProfitMargin/netProfitMarginDefinition';
import { assetTurnoverDefinition } from '@/domainPitMetrics/efficiency/assetTurnover/assetTurnoverDefinition';
import { equityMultiplierDefinition } from '@/domainPitMetrics/resilience/equityMultiplier/equityMultiplierDefinition';
import { dupontDecomposedRoeDefinition } from '@/domainPitMetrics/profitability/dupontDecomposedRoe/dupontDecomposedRoeDefinition';
import { dupontTaxBurdenDefinition } from '@/domainPitMetrics/profitability/dupontTaxBurden/dupontTaxBurdenDefinition';
import { dupontInterestBurdenDefinition } from '@/domainPitMetrics/profitability/dupontInterestBurden/dupontInterestBurdenDefinition';
import { dupontEbitMarginDefinition } from '@/domainPitMetrics/profitability/dupontEbitMargin/dupontEbitMarginDefinition';
import { dupontExtendedRoeDefinition } from '@/domainPitMetrics/profitability/dupontExtendedRoe/dupontExtendedRoeDefinition';
import { epsDefinition } from '@/domainPitMetrics/profitability/eps/epsDefinition';
import { bvpsDefinition } from '@/domainPitMetrics/valuation/bvps/bvpsDefinition';
import { peRatioDefinition } from '@/domainPitMetrics/valuation/peRatio/peRatioDefinition';
import { pbRatioDefinition } from '@/domainPitMetrics/valuation/pbRatio/pbRatioDefinition';
import { stockPriceDefinition } from '@/domainPitMetrics/valuation/stockPrice/stockPriceDefinition';
import { revenuePerShareDefinition } from '@/domainPitMetrics/profitability/revenuePerShare/revenuePerShareDefinition';
import { dividendPayoutRatioDefinition } from '@/domainPitMetrics/dividend/dividendPayoutRatio/dividendPayoutRatioDefinition';
import { sgrDefinition } from '@/domainPitMetrics/growth/sgr/sgrDefinition';
import { ocfPerShareDefinition } from '@/domainPitMetrics/quality/ocfPerShare/ocfPerShareDefinition';
import { fcfPerShareDefinition } from '@/domainPitMetrics/quality/fcfPerShare/fcfPerShareDefinition';
import { ocfToNetIncomeDefinition } from '@/domainPitMetrics/quality/ocfToNetIncome/ocfToNetIncomeDefinition';
import { accrualsRatioDefinition } from '@/domainPitMetrics/quality/accrualsRatio/accrualsRatioDefinition';
import { debtRatioDefinition } from '@/domainPitMetrics/resilience/debtRatio/debtRatioDefinition';
import { currentRatioDefinition } from '@/domainPitMetrics/resilience/currentRatio/currentRatioDefinition';
import { quickRatioDefinition } from '@/domainPitMetrics/resilience/quickRatio/quickRatioDefinition';
import { cashRatioDefinition } from '@/domainPitMetrics/resilience/cashRatio/cashRatioDefinition';
import { deRatioDefinition } from '@/domainPitMetrics/resilience/deRatio/deRatioDefinition';
import { interestCoverageDefinition } from '@/domainPitMetrics/resilience/interestCoverage/interestCoverageDefinition';
import { netDebtToEbitdaDefinition } from '@/domainPitMetrics/resilience/netDebtToEbitda/netDebtToEbitdaDefinition';
import { capexToRevenueDefinition } from '@/domainPitMetrics/efficiency/capexToRevenue/capexToRevenueDefinition';
import { psrDefinition } from '@/domainPitMetrics/valuation/psr/psrDefinition';
import { pFcfDefinition } from '@/domainPitMetrics/valuation/pFcf/pFcfDefinition';
import { evEbitdaDefinition } from '@/domainPitMetrics/valuation/evEbitda/evEbitdaDefinition';
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
import { grahamNumberDefinition } from '@/domainPitMetrics/valuation/grahamNumber/grahamNumberDefinition';
import { ncavDefinition } from '@/domainPitMetrics/valuation/ncav/ncavDefinition';
import { ownerEarningsDefinition } from '@/domainPitMetrics/quality/ownerEarnings/ownerEarningsDefinition';
import { altmanZScoreDefinition } from '@/domainPitMetrics/resilience/altmanZScore/altmanZScoreDefinition';
import { piotroskiFScoreDefinition } from '@/domainPitMetrics/quality/piotroskiFScore/piotroskiFScoreDefinition';
import { beneishMScoreDefinition } from '@/domainPitMetrics/quality/beneishMScore/beneishMScoreDefinition';
import { nissimPenmanRnoaDefinition } from '@/domainPitMetrics/profitability/nissimPenmanRnoa/nissimPenmanRnoaDefinition';
import { zmijewskiScoreDefinition } from '@/domainPitMetrics/resilience/zmijewskiScore/zmijewskiScoreDefinition';
import { ohlsonOScoreDefinition } from '@/domainPitMetrics/resilience/ohlsonOScore/ohlsonOScoreDefinition';
import { fcfYieldDefinition } from '@/domainPitMetrics/valuation/fcfYield/fcfYieldDefinition';
import { bankNplRatioDefinition } from '@/domainPitMetrics/resilience/bankNplRatio/bankNplRatioDefinition';
import { bankNplCoverageRatioDefinition } from '@/domainPitMetrics/resilience/bankNplCoverageRatio/bankNplCoverageRatioDefinition';
import { bankCarRatioDefinition } from '@/domainPitMetrics/resilience/bankCarRatio/bankCarRatioDefinition';
import { bankCet1RatioDefinition } from '@/domainPitMetrics/resilience/bankCet1Ratio/bankCet1RatioDefinition';
import { bankTier1RatioDefinition } from '@/domainPitMetrics/resilience/bankTier1Ratio/bankTier1RatioDefinition';
import { exchangePeRatioDefinition } from '@/domainPitMetrics/valuation/exchangePeRatio/exchangePeRatioDefinition';
import { exchangePbRatioDefinition } from '@/domainPitMetrics/valuation/exchangePbRatio/exchangePbRatioDefinition';
import { dividendYieldDefinition } from '@/domainPitMetrics/dividend/dividendYield/dividendYieldDefinition';
import { betaDefinition } from '@/domainPitMetrics/valuation/beta/betaDefinition';

// 程式碼中的宣告式 registry（docs/analysis-ts-spec-v0.2.md §6.3）；DB 的 metric_definitions
// 一列從這裡 upsert 出去，避免兩邊各自維護一份定義而漂移。命名避開裸的 `registry`——
// src/adapters/swagger/registry.ts 已經有一個完全不同語意的 OpenAPIRegistry 實例叫這個名字。
//
// 2026-09-09 拆檔：每個 metricCode 的完整定義（displayName/unit/formulaNote/group/
// allowedXxx/dependsOn/currentFormulaVersion）已經搬到它自己的資料夾
// （src/domainPitMetrics/<分類>/<metricCode>/<metricCode>Definition.ts），跟計算邏輯
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
