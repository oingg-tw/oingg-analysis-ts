// 2026-09-11：從 backfillAllMetricsLatestFullMarketPit.ts 抽出來的共用模組——原本
// buildGeneralTasks/buildBankTasks/runTasks 直接定義在主腳本裡並 export，但主腳本檔尾
// 有 `main().catch(...)`（top-level 執行），retryBackfillFailuresPit.ts 如果直接 import
// 主腳本會連帶觸發整批全市場 backfill 重跑——這是一個真的會發生的 bug，不是假設情境。
// 抽成獨立、沒有任何 top-level 執行副作用的模組，兩支腳本都從這裡 import，才是安全的
// 「精準回補」機制。
import { computeAndWriteAbnormalCapexRatioPit, computeAndWriteAccrualsRatioPit, computeAndWriteAltmanZDoublePrimeScorePit, computeAndWriteAltmanZScorePit, computeAndWriteAssetGrowthPit, computeAndWriteBankAssetQualityFamilyPit, computeAndWriteBankCapitalAdequacyFamilyPit, computeAndWriteBankIncomeWaterfallPit, computeAndWriteBeneishAqiPit, computeAndWriteBeneishDsriPit, computeAndWriteBeneishMScorePit, computeAndWriteBetaPit, computeAndWriteBuybackYieldPit, computeAndWriteBvpsGrowthRatePit, computeAndWriteBvpsPit, computeAndWriteCapexToRevenuePit, computeAndWriteCashFlowPerSharePit, computeAndWriteCashFlowValuationFamilyPit, computeAndWriteCashToAssetsRatioPit, computeAndWriteChowderNumberPit, computeAndWriteConsecutiveDividendYearsPit, computeAndWriteConsecutiveProfitYearsPit, computeAndWriteCrociPit, computeAndWriteDebtRatioPit, computeAndWriteDeRatioPit, computeAndWriteDividendCoverageRatioPit, computeAndWriteDividendDistributionCountPit, computeAndWriteDividendGrowthRateFamilyPit, computeAndWriteDividendPayoutRatioPit, computeAndWriteDividendPerSharePit, computeAndWriteDupontFamilyPit, computeAndWriteEarningsYieldPit, computeAndWriteEpsCagrFamilyPit, computeAndWriteEpsGrowthRatePit, computeAndWriteEpsPit, computeAndWriteEquityGrowthRatePit, computeAndWriteEquityRatioPit, computeAndWriteEvEbitdaPit, computeAndWriteEvToEbitPit, computeAndWriteEvToFcfPit, computeAndWriteFamaFrenchOperatingProfitabilityPit, computeAndWriteFcfMarginPit, computeAndWriteFcfYieldPit, computeAndWriteGrahamNumberPit, computeAndWriteGreenblattEarningsYieldPit, computeAndWriteGreenblattRocPit, computeAndWriteIncomeStatementPerSharePit, computeAndWriteInterestCoveragePit, computeAndWriteLeverageDegreeFamilyPit, computeAndWriteLiquidityRatioPit, computeAndWriteLongTermDebtToNetCurrentAssetsPit, computeAndWriteMarginsFamilyPit, computeAndWriteMarketCapPit, computeAndWriteMarketRatiosPit, computeAndWriteNcavPit, computeAndWriteNetDebtToEbitdaPit, computeAndWriteNetIncomeGrowthRatePit, computeAndWriteNetWorkingCapitalToAssetsPit, computeAndWriteNissimPenmanRnoaPit, computeAndWriteNonOperatingIncomeRatioPit, computeAndWriteNovyMarxGpToAssetsPit, computeAndWriteOcfToNetIncomePit, computeAndWriteOhlsonOScorePit, computeAndWriteOneDollarTestPit, computeAndWriteOperatingExpenseRatioPit, computeAndWriteOperatingIncomeGrowthRatePit, computeAndWriteOwnerEarningsPit, computeAndWritePbRatioPit, computeAndWritePegRatioPit, computeAndWritePeRatioPit, computeAndWritePFcfPit, computeAndWritePiotroskiFScorePit, computeAndWritePretaxIncomePerSharePit, computeAndWritePriceToResearchRatioPit, computeAndWritePsrPit, computeAndWriteRdIntensityPit, computeAndWriteRevenueCagrFamilyPit, computeAndWriteRevenueGrowthRatePit, computeAndWriteRevenuePerSharePit, computeAndWriteRoaPit, computeAndWriteRocePit, computeAndWriteRoePit, computeAndWriteRoicPit, computeAndWriteRuleOf40Pit, computeAndWriteSgrPit, computeAndWriteShareCountChangeRatePit, computeAndWriteShareholderYieldPit, computeAndWriteStockPricePit, computeAndWriteSuePit, computeAndWriteTobinsQPit, computeAndWriteTotalDebtToCapitalPit, computeAndWriteTurnoverRatioFamilyPit, computeAndWriteZmijewskiScorePit } from '../src/bootstrap/pitMetrics';

// 2026-09-14 使用者發現：這份清單在 2026-09-11「全市場六季財報深度解鎖」批次跟
// 2026-09-13「量化選股法則」批次各自新增指標時，都沒有回頭更新這份清單（兩份清單之間
// 沒有型別系統強制同步，純粹手動維護），導致全市場歷史回補（backfillFullHistoryFullMarketPit.ts）
// 從一開始就沒涵蓋到這 19 支指標（含 2 個家族函式）。這裡一次補齊。
// greenblattEarningsYield 先不註冊/不回填（2026-09-14 使用者要求，等神奇公式上線再合併
// 進來），見 metricDefinitionRegistry.ts 同一則說明。
export const GENERAL_METRIC_CODES = [
  'roe', 'roa', 'dupontDecomposedRoe', 'dupontEbitMargin', 'dupontExtendedRoe', 'dupontInterestBurden', 'dupontTaxBurden', 'netProfitMargin', 'equityMultiplier',
  'grahamNumber', 'ownerEarnings', 'altmanZScore', 'piotroskiFScore', 'beneishMScore', 'nissimPenmanRnoa', 'zmijewskiScore', 'ohlsonOScore',
  'grossMargin', 'operatingMargin', 'assetTurnover', 'fixedAssetTurnover', 'inventoryDays', 'inventoryTurnover', 'payablesDays', 'payablesTurnover', 'receivablesDays', 'receivablesTurnover', 'cashConversionCycle', 'operatingCycle', 'netWorkingCapitalTurnover', 'inventoryToRevenueRatio', 'receivablesToRevenueRatio',
  'eps', 'pretaxIncomePerShare', 'grossProfitPerShare', 'operatingIncomePerShare', 'bvps', 'revenuePerShare', 'dividendPayoutRatio', 'dividendPerShare', 'sgr', 'ocfPerShare', 'fcfPerShare', 'depreciationAmortizationPerShare', 'ocfToNetIncome', 'accrualsRatio', 'fcfYield',
  'debtRatio', 'currentRatio', 'quickRatio', 'cashRatio', 'deRatio', 'longTermDebtToNetCurrentAssets', 'interestCoverage', 'netDebtToEbitda', 'capexToRevenue', 'psr', 'pFcf', 'evEbitda', 'roic', 'roce',
  'revenueGrowthRate', 'epsGrowthRate', 'netIncomeGrowthRate', 'operatingIncomeGrowthRate', 'equityGrowthRate', 'bvpsGrowthRate',
  'assetGrowth', 'consecutiveProfitYears', 'earningsYield',
  'buybackYield', 'dividendCoverageRatio', 'shareCountChangeRate', 'shareholderYield',
  'stockPrice', 'peRatio', 'pbRatio',
  'abnormalCapexRatio', 'altmanZDoublePrimeScore',
  'chowderNumber', 'consecutiveDividendYears', 'dividendDistributionCount', 'famaFrenchOperatingProfitability', 'rdIntensity', 'sue',
  'revenueCagr3y', 'revenueCagr5y', 'revenueCagr8y', 'epsCagr3y', 'epsCagr5y', 'epsCagr8y', 'dividendGrowthRate3y', 'dividendGrowthRate5y', 'dividendGrowthRate8y', 'oneDollarTest',
  'operatingExpenseRatio',
  'ncav', 'marketCap', 'pegRatio',
  'evToEbit', 'evToFcf', 'greenblattRoc', 'greenblattEarningsYield', 'tobinsQ', 'priceToResearchRatio',
  'novyMarxGpToAssets', 'croci', 'fcfMargin', 'ruleOf40', 'netWorkingCapitalToAssets', 'totalDebtToCapital',
  'nonOperatingIncomeRatio', 'equityRatio', 'cashToAssetsRatio', 'beneishAqi', 'beneishDsri',
  'evToOcf', 'evToSales', 'priceToOcf', 'debtToFcf', 'capexToOcfRatio', 'croic', 'ocfMargin', 'fcfConversionRate',
  'financialLeverageDegree', 'totalLeverageDegree',
  'beta', 'exchangePeRatio', 'exchangePbRatio', 'dividendYield',
];

export const BANK_METRIC_CODES = [
  'bankNplRatio',
  'bankNplCoverageRatio',
  'bankCarRatio',
  'bankCet1Ratio',
  'bankTier1Ratio',
  'bankNetInterestIncomePerShare',
  'bankNetNonInterestIncomePerShare',
  'bankBadDebtProvisionPerShare',
  'bankOtherOperatingExpensePerShare',
];

export type BackfillTask = [string, () => Promise<unknown>];

// buildGeneralTasks()/buildBankTasks() 是 backfillAllMetricsLatestFullMarketPit.ts 跟
// retryBackfillFailuresPit.ts 共用的單一事實來源——兩支腳本都從這裡 import 同一份指標
// 清單，之後新增/移除指標只要改這裡一個地方，不會有兩份清單各自維護卻漏改其中一份的
// 風險。retryBackfillFailuresPit.ts 靠這份清單依 label 篩出「只重跑失敗的那幾支」。
// 2026-09-13 使用者要求全市場全歷史 backfill（見 scripts/backfillFullHistoryFullMarketPit.ts）
// 新增可選的 quarter 參數——原本這裡固定不傳 year/season，每支 compute*Pit 函式都會走
// 「省略時自動解析最新可用季度」的既有慣例（見 computeGrahamNumberPit.ts 的說明）；
// 傳入 quarter 之後改成算「這一季」，讓同一份任務清單可以被歷史回填腳本重複呼叫、
// 每次指定不同季度，不用另外維護一份幾乎一樣的清單。
// 逐日型指標（beta/marketRatios，內部靠交易日快照解析、沒有「這一季」的概念）在指定
// quarter 時刻意跳過，不是遺漏——beta 全市場歷史回填是另一個獨立問題（見
// project_beta_pit_pending.md 的既有決策，逐日全歷史回填成本高很多倍且非必要），跟這批
// 季報型指標的歷史回填不是同一件事，不要混著做。
export const buildGeneralTasks = (symbol: string, quarter?: { year: string; season: '1' | '2' | '3' | '4' }): BackfillTask[] => {
  const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '', ...quarter };
  const dailyQuery = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };

  const periodTasks: BackfillTask[] = [
    ['roe', () => computeAndWriteRoePit(query)],
    ['roa', () => computeAndWriteRoaPit(query)],
    ['dupont', () => computeAndWriteDupontFamilyPit(query)],
    ['grahamNumber', () => computeAndWriteGrahamNumberPit(query)],
    ['ownerEarnings', () => computeAndWriteOwnerEarningsPit(query)],
    ['altmanZScore', () => computeAndWriteAltmanZScorePit(query)],
    ['piotroskiFScore', () => computeAndWritePiotroskiFScorePit(query)],
    ['beneishMScore', () => computeAndWriteBeneishMScorePit(query)],
    ['nissimPenmanRnoa', () => computeAndWriteNissimPenmanRnoaPit(query)],
    ['zmijewskiScore', () => computeAndWriteZmijewskiScorePit(query)],
    ['ohlsonOScore', () => computeAndWriteOhlsonOScorePit(query)],
    ['margins', () => computeAndWriteMarginsFamilyPit(query)],
    ['turnoverRatio', () => computeAndWriteTurnoverRatioFamilyPit(query)],
    ['eps', () => computeAndWriteEpsPit(query)],
    ['incomeStatementPerShare', () => computeAndWriteIncomeStatementPerSharePit(query)],
    ['pretaxIncomePerShare', () => computeAndWritePretaxIncomePerSharePit(query)],
    ['bvps', () => computeAndWriteBvpsPit(query)],
    ['revenuePerShare', () => computeAndWriteRevenuePerSharePit(query)],
    ['dividendPayoutRatio', () => computeAndWriteDividendPayoutRatioPit(query)],
    ['dividendPerShare', () => computeAndWriteDividendPerSharePit(query)],
    ['sgr', () => computeAndWriteSgrPit(query)],
    ['cashFlowPerShare', () => computeAndWriteCashFlowPerSharePit(query)],
    ['ocfToNetIncome', () => computeAndWriteOcfToNetIncomePit(query)],
    ['accrualsRatio', () => computeAndWriteAccrualsRatioPit(query)],
    ['fcfYield', () => computeAndWriteFcfYieldPit(query)],
    ['debtRatio', () => computeAndWriteDebtRatioPit(query)],
    ['liquidityRatio', () => computeAndWriteLiquidityRatioPit(query)],
    ['deRatio', () => computeAndWriteDeRatioPit(query)],
    ['longTermDebtToNetCurrentAssets', () => computeAndWriteLongTermDebtToNetCurrentAssetsPit(query)],
    ['interestCoverage', () => computeAndWriteInterestCoveragePit(query)],
    ['netDebtToEbitda', () => computeAndWriteNetDebtToEbitdaPit(query)],
    ['capexToRevenue', () => computeAndWriteCapexToRevenuePit(query)],
    ['psr', () => computeAndWritePsrPit(query)],
    ['pFcf', () => computeAndWritePFcfPit(query)],
    ['evEbitda', () => computeAndWriteEvEbitdaPit(query)],
    ['roic', () => computeAndWriteRoicPit(query)],
    ['roce', () => computeAndWriteRocePit(query)],
    ['revenueGrowthRate', () => computeAndWriteRevenueGrowthRatePit(query)],
    ['epsGrowthRate', () => computeAndWriteEpsGrowthRatePit(query)],
    ['netIncomeGrowthRate', () => computeAndWriteNetIncomeGrowthRatePit(query)],
    ['operatingIncomeGrowthRate', () => computeAndWriteOperatingIncomeGrowthRatePit(query)],
    ['equityGrowthRate', () => computeAndWriteEquityGrowthRatePit(query)],
    ['bvpsGrowthRate', () => computeAndWriteBvpsGrowthRatePit(query)],
    ['assetGrowth', () => computeAndWriteAssetGrowthPit(query)],
    ['consecutiveProfitYears', () => computeAndWriteConsecutiveProfitYearsPit(query)],
    ['earningsYield', () => computeAndWriteEarningsYieldPit(query)],
    ['buybackYield', () => computeAndWriteBuybackYieldPit(query)],
    ['dividendCoverageRatio', () => computeAndWriteDividendCoverageRatioPit(query)],
    ['shareholderYield', () => computeAndWriteShareholderYieldPit(query)],
    ['shareCountChangeRate', () => computeAndWriteShareCountChangeRatePit(query)],
    ['stockPrice', () => computeAndWriteStockPricePit(query)],
    ['peRatio', () => computeAndWritePeRatioPit(query)],
    ['pbRatio', () => computeAndWritePbRatioPit(query)],
    ['abnormalCapexRatio', () => computeAndWriteAbnormalCapexRatioPit(query)],
    ['altmanZDoublePrimeScore', () => computeAndWriteAltmanZDoublePrimeScorePit(query)],
    ['chowderNumber', () => computeAndWriteChowderNumberPit(query)],
    ['consecutiveDividendYears', () => computeAndWriteConsecutiveDividendYearsPit(query)],
    ['dividendDistributionCount', () => computeAndWriteDividendDistributionCountPit(query)],
    ['famaFrenchOperatingProfitability', () => computeAndWriteFamaFrenchOperatingProfitabilityPit(query)],
    ['rdIntensity', () => computeAndWriteRdIntensityPit(query)],
    ['sue', () => computeAndWriteSuePit(query)],
    ['revenueCagrFamily', () => computeAndWriteRevenueCagrFamilyPit(query)],
    ['oneDollarTest', () => computeAndWriteOneDollarTestPit(query)],
    ['epsCagrFamily', () => computeAndWriteEpsCagrFamilyPit(query)],
    ['dividendGrowthRateFamily', () => computeAndWriteDividendGrowthRateFamilyPit(query)],
    ['operatingExpenseRatio', () => computeAndWriteOperatingExpenseRatioPit(query)],
    ['ncav', () => computeAndWriteNcavPit(query)],
    ['marketCap', () => computeAndWriteMarketCapPit(query)],
    ['pegRatio', () => computeAndWritePegRatioPit(query)],
    ['evToEbit', () => computeAndWriteEvToEbitPit(query)],
    ['evToFcf', () => computeAndWriteEvToFcfPit(query)],
    ['greenblattRoc', () => computeAndWriteGreenblattRocPit(query)],
    ['greenblattEarningsYield', () => computeAndWriteGreenblattEarningsYieldPit(query)],
    ['tobinsQ', () => computeAndWriteTobinsQPit(query)],
    ['priceToResearchRatio', () => computeAndWritePriceToResearchRatioPit(query)],
    ['novyMarxGpToAssets', () => computeAndWriteNovyMarxGpToAssetsPit(query)],
    ['croci', () => computeAndWriteCrociPit(query)],
    ['fcfMargin', () => computeAndWriteFcfMarginPit(query)],
    ['ruleOf40', () => computeAndWriteRuleOf40Pit(query)],
    ['netWorkingCapitalToAssets', () => computeAndWriteNetWorkingCapitalToAssetsPit(query)],
    ['totalDebtToCapital', () => computeAndWriteTotalDebtToCapitalPit(query)],
    ['nonOperatingIncomeRatio', () => computeAndWriteNonOperatingIncomeRatioPit(query)],
    ['equityRatio', () => computeAndWriteEquityRatioPit(query)],
    ['cashToAssetsRatio', () => computeAndWriteCashToAssetsRatioPit(query)],
    ['beneishAqi', () => computeAndWriteBeneishAqiPit(query)],
    ['beneishDsri', () => computeAndWriteBeneishDsriPit(query)],
    ['cashFlowValuationFamily', () => computeAndWriteCashFlowValuationFamilyPit(query)],
    ['leverageDegreeFamily', () => computeAndWriteLeverageDegreeFamilyPit(query)],
  ];

  if (quarter) return periodTasks; // 逐日型指標沒有「這一季」的概念，指定 quarter 時跳過，見上方說明。

  return [
    ...periodTasks,
    // 逐日型：不傳 date，函式自己解析「最新可用交易日」，只算一次不是每個歷史交易日都算。
    ['beta', () => computeAndWriteBetaPit(dailyQuery)],
    ['marketRatios', () => computeAndWriteMarketRatiosPit(dailyQuery)],
  ];
};

export const buildBankTasks = (symbol: string, quarter?: { year: string; season: '1' | '2' | '3' | '4' }): BackfillTask[] => {
  const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '', ...quarter };
  return [
    ['bankAssetQuality', () => computeAndWriteBankAssetQualityFamilyPit(query)],
    ['bankCapitalAdequacy', () => computeAndWriteBankCapitalAdequacyFamilyPit(query)],
    ['bankIncomeWaterfall', () => computeAndWriteBankIncomeWaterfallPit(query)],
  ];
};

// 2026-09-17 補回傳 outcomes（成功任務的回傳值，跟 label 配對）——原本只回 failures、把
// compute 結果整個丟掉，scripts/verifyMetricEquivalencePit.ts 要靠每個 basis 的 action
// （inserted/skipped_unchanged/…）統計來證明重構後寫入值完全沒變。既有呼叫端只解構
// failures，不受影響。
export const runTasks = async (
  tasks: BackfillTask[]
): Promise<{ failures: { label: string; error: unknown }[]; outcomes: { label: string; outcome: unknown }[] }> => {
  const results = await Promise.allSettled(tasks.map(([, fn]) => fn()));
  const failures = results.flatMap((r, i) => (r.status === 'rejected' ? [{ label: tasks[i]![0], error: r.reason }] : []));
  const outcomes = results.flatMap((r, i) => (r.status === 'fulfilled' ? [{ label: tasks[i]![0], outcome: r.value }] : []));
  return { failures, outcomes };
};

export interface BackfillFailure {
  symbol: string;
  label: string;
  message: string;
}
