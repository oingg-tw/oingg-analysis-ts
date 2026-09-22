// 2026-09-11：從 backfillAllMetricsLatestFullMarketPit.ts 抽出來的共用模組——原本
// buildGeneralTasks/buildBankTasks/runTasks 直接定義在主腳本裡並 export，但主腳本檔尾
// 有 `main().catch(...)`（top-level 執行），retryBackfillFailuresPit.ts 如果直接 import
// 主腳本會連帶觸發整批全市場 backfill 重跑——這是一個真的會發生的 bug，不是假設情境。
// 抽成獨立、沒有任何 top-level 執行副作用的模組，兩支腳本都從這裡 import，才是安全的
// 「精準回補」機制。
import { computeAndWriteAbnormalCapexRatioPit, computeAndWriteAccrualsRatioPit, computeAndWriteAltmanZDoublePrimeScorePit, computeAndWriteAltmanZScorePit, computeAndWriteAssetGrowthPit, computeAndWriteBankAssetQualityFamilyPit, computeAndWriteBankCapitalAdequacyFamilyPit, computeAndWriteBankIncomeWaterfallPit, computeAndWriteBeneishAqiPit, computeAndWriteBeneishDsriPit, computeAndWriteBeneishMScorePit, computeAndWriteBetaPit, computeAndWriteBuybackYieldPit, computeAndWriteBvpsGrowthRatePit, computeAndWriteBvpsPit, computeAndWriteCapexToRevenuePit, computeAndWriteCashFlowPerSharePit, computeAndWriteCashFlowValuationFamilyPit, computeAndWriteCashToAssetsRatioPit, computeAndWriteChowderNumberPit, computeAndWriteConsecutiveDividendYearsPit, computeAndWriteConsecutiveProfitYearsPit, computeAndWriteCrociPit, computeAndWriteDebtRatioPit, computeAndWriteDeRatioPit, computeAndWriteDividendCoverageRatioPit, computeAndWriteDividendDistributionCountPit, computeAndWriteDividendGrowthRateFamilyPit, computeAndWriteDividendPayoutRatioPit, computeAndWriteDividendPerSharePit, computeAndWriteDupontFamilyPit, computeAndWriteEarningsToRecordHighPit, computeAndWriteEarningsYieldPit, computeAndWriteEpsCagrFamilyPit, computeAndWriteEpsGrowthRatePit, computeAndWriteEpsPit, computeAndWriteEquityGrowthRatePit, computeAndWriteEquityRatioPit, computeAndWriteEvEbitdaPit, computeAndWriteEvToEbitPit, computeAndWriteEvToFcfPit, computeAndWriteFamaFrenchOperatingProfitabilityPit, computeAndWriteFcfMarginPit, computeAndWriteFcfYieldPit, computeAndWriteGrahamNumberPit, computeAndWriteGreenblattEarningsYieldPit, computeAndWriteGreenblattRocPit, computeAndWriteIncomeStatementPerSharePit, computeAndWriteInterestCoveragePit, computeAndWriteLeverageDegreeFamilyPit, computeAndWriteLiquidityRatioPit, computeAndWriteLongTermDebtToNetCurrentAssetsPit, computeAndWriteMarginsFamilyPit, computeAndWriteMarketCapPit, computeAndWriteMarketRatiosPit, computeAndWriteNcavPit, computeAndWriteNetDebtToEbitdaPit, computeAndWriteNetIncomeGrowthRatePit, computeAndWriteNetWorkingCapitalToAssetsPit, computeAndWriteNissimPenmanRnoaPit, computeAndWriteNonOperatingIncomeRatioPit, computeAndWriteNovyMarxGpToAssetsPit, computeAndWriteOcfToNetIncomePit, computeAndWriteOhlsonOScorePit, computeAndWriteOneDollarTestPit, computeAndWriteOperatingExpenseRatioPit, computeAndWriteOperatingIncomeGrowthRatePit, computeAndWriteOwnerEarningsPit, computeAndWritePbRatioPit, computeAndWritePegRatioPit, computeAndWritePeRatioPit, computeAndWritePFcfPit, computeAndWritePiotroskiFScorePit, computeAndWritePretaxIncomePerSharePit, computeAndWritePriceToResearchRatioPit, computeAndWritePsrPit, computeAndWriteRdIntensityPit, computeAndWriteRevenueCagrFamilyPit, computeAndWriteRevenueGrowthRatePit, computeAndWriteRevenuePerSharePit, computeAndWriteRoaPit, computeAndWriteRocePit, computeAndWriteRoePit, computeAndWriteRoicPit, computeAndWriteRuleOf40Pit, computeAndWriteSgrPit, computeAndWriteShareCountChangeRatePit, computeAndWriteShareholderYieldPit, computeAndWriteStockPricePit, computeAndWriteSuePit, computeAndWriteThreeMarginsRisingPit, computeAndWriteTobinsQPit, computeAndWriteTotalDebtToCapitalPit, computeAndWriteTurnoverRatioFamilyPit, computeAndWriteZmijewskiScorePit } from '../src/bootstrap/pitMetrics';
import { reportAvailability } from '../src/bootstrap/scripts';

// 2026-09-14 使用者發現：這份清單在 2026-09-11「全市場六季財報深度解鎖」批次跟
// 2026-09-13「量化選股法則」批次各自新增指標時，都沒有回頭更新這份清單（兩份清單之間
// 沒有型別系統強制同步，純粹手動維護），導致全市場歷史回補（backfillFullHistoryFullMarketPit.ts）
// 從一開始就沒涵蓋到這 19 支指標（含 2 個家族函式）。這裡一次補齊。
// greenblattEarningsYield 先不註冊/不回填（2026-09-14 使用者要求，等神奇公式上線再合併
// 進來），見 metricDefinitionRegistry.ts 同一則說明。
export const GENERAL_METRIC_CODES = [
  'roe', 'roa', 'dupontDecomposedRoe', 'dupontEbitMargin', 'dupontExtendedRoe', 'dupontInterestBurden', 'dupontTaxBurden', 'netProfitMargin', 'equityMultiplier',
  'grahamNumber', 'ownerEarnings', 'altmanZScore', 'piotroskiFScore', 'threeMarginsRising', 'earningsToRecordHigh', 'beneishMScore', 'nissimPenmanRnoa', 'zmijewskiScore', 'ohlsonOScore',
  'grossMargin', 'operatingMargin', 'assetTurnover', 'fixedAssetTurnover', 'inventoryDays', 'inventoryTurnover', 'payablesDays', 'payablesTurnover', 'receivablesDays', 'receivablesTurnover', 'cashConversionCycle', 'operatingCycle', 'netWorkingCapitalTurnover', 'inventoryToRevenueRatio', 'receivablesToRevenueRatio',
  'eps', 'pretaxIncomePerShare', 'grossProfitPerShare', 'operatingIncomePerShare', 'costOfGoodsSoldPerShare', 'operatingExpensePerShare', 'incomeTaxExpensePerShare', 'bvps', 'revenuePerShare', 'dividendPayoutRatio', 'dividendPerShare', 'sgr', 'ocfPerShare', 'fcfPerShare', 'depreciationAmortizationPerShare', 'ocfToNetIncome', 'accrualsRatio', 'fcfYield',
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
// 2026-09-22：dataType 不再寫死 '2'——每家公司的口徑由 reportAvailability 決定（有合併報表 '2'、只有個體報表
// '1'，見 application/ports/reportAvailability.ts），所以 query 變成 async 工廠，在每個 task 執行時才解析
// （整張表載一次進記憶體，之後是 Map 查找）。逐日型的 dailyQuery 同一個口徑鍵，理由見該 port 檔頭。
export const buildGeneralTasks = (symbol: string, quarter?: { year: string; season: '1' | '2' | '3' | '4' }): BackfillTask[] => {
  const query = async () => ({ symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '', ...quarter });
  const dailyQuery = async () => ({ symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '' });

  const periodTasks: BackfillTask[] = [
    ['roe', async () => computeAndWriteRoePit(await query())],
    ['roa', async () => computeAndWriteRoaPit(await query())],
    ['dupont', async () => computeAndWriteDupontFamilyPit(await query())],
    ['grahamNumber', async () => computeAndWriteGrahamNumberPit(await query())],
    ['ownerEarnings', async () => computeAndWriteOwnerEarningsPit(await query())],
    ['altmanZScore', async () => computeAndWriteAltmanZScorePit(await query())],
    ['piotroskiFScore', async () => computeAndWritePiotroskiFScorePit(await query())],
    ['beneishMScore', async () => computeAndWriteBeneishMScorePit(await query())],
    ['nissimPenmanRnoa', async () => computeAndWriteNissimPenmanRnoaPit(await query())],
    ['zmijewskiScore', async () => computeAndWriteZmijewskiScorePit(await query())],
    ['ohlsonOScore', async () => computeAndWriteOhlsonOScorePit(await query())],
    ['margins', async () => computeAndWriteMarginsFamilyPit(await query())],
    ['turnoverRatio', async () => computeAndWriteTurnoverRatioFamilyPit(await query())],
    ['eps', async () => computeAndWriteEpsPit(await query())],
    ['incomeStatementPerShare', async () => computeAndWriteIncomeStatementPerSharePit(await query())],
    ['pretaxIncomePerShare', async () => computeAndWritePretaxIncomePerSharePit(await query())],
    ['bvps', async () => computeAndWriteBvpsPit(await query())],
    ['revenuePerShare', async () => computeAndWriteRevenuePerSharePit(await query())],
    ['dividendPayoutRatio', async () => computeAndWriteDividendPayoutRatioPit(await query())],
    ['dividendPerShare', async () => computeAndWriteDividendPerSharePit(await query())],
    ['sgr', async () => computeAndWriteSgrPit(await query())],
    ['threeMarginsRising', async () => computeAndWriteThreeMarginsRisingPit(await query())],
    ['earningsToRecordHigh', async () => computeAndWriteEarningsToRecordHighPit(await query())],
    ['cashFlowPerShare', async () => computeAndWriteCashFlowPerSharePit(await query())],
    ['ocfToNetIncome', async () => computeAndWriteOcfToNetIncomePit(await query())],
    ['accrualsRatio', async () => computeAndWriteAccrualsRatioPit(await query())],
    ['fcfYield', async () => computeAndWriteFcfYieldPit(await query())],
    ['debtRatio', async () => computeAndWriteDebtRatioPit(await query())],
    ['liquidityRatio', async () => computeAndWriteLiquidityRatioPit(await query())],
    ['deRatio', async () => computeAndWriteDeRatioPit(await query())],
    ['longTermDebtToNetCurrentAssets', async () => computeAndWriteLongTermDebtToNetCurrentAssetsPit(await query())],
    ['interestCoverage', async () => computeAndWriteInterestCoveragePit(await query())],
    ['netDebtToEbitda', async () => computeAndWriteNetDebtToEbitdaPit(await query())],
    ['capexToRevenue', async () => computeAndWriteCapexToRevenuePit(await query())],
    ['psr', async () => computeAndWritePsrPit(await query())],
    ['pFcf', async () => computeAndWritePFcfPit(await query())],
    ['evEbitda', async () => computeAndWriteEvEbitdaPit(await query())],
    ['roic', async () => computeAndWriteRoicPit(await query())],
    ['roce', async () => computeAndWriteRocePit(await query())],
    ['revenueGrowthRate', async () => computeAndWriteRevenueGrowthRatePit(await query())],
    ['epsGrowthRate', async () => computeAndWriteEpsGrowthRatePit(await query())],
    ['netIncomeGrowthRate', async () => computeAndWriteNetIncomeGrowthRatePit(await query())],
    ['operatingIncomeGrowthRate', async () => computeAndWriteOperatingIncomeGrowthRatePit(await query())],
    ['equityGrowthRate', async () => computeAndWriteEquityGrowthRatePit(await query())],
    ['bvpsGrowthRate', async () => computeAndWriteBvpsGrowthRatePit(await query())],
    ['assetGrowth', async () => computeAndWriteAssetGrowthPit(await query())],
    ['consecutiveProfitYears', async () => computeAndWriteConsecutiveProfitYearsPit(await query())],
    ['earningsYield', async () => computeAndWriteEarningsYieldPit(await query())],
    ['buybackYield', async () => computeAndWriteBuybackYieldPit(await query())],
    ['dividendCoverageRatio', async () => computeAndWriteDividendCoverageRatioPit(await query())],
    ['shareholderYield', async () => computeAndWriteShareholderYieldPit(await query())],
    ['shareCountChangeRate', async () => computeAndWriteShareCountChangeRatePit(await query())],
    ['stockPrice', async () => computeAndWriteStockPricePit(await query())],
    ['peRatio', async () => computeAndWritePeRatioPit(await query())],
    ['pbRatio', async () => computeAndWritePbRatioPit(await query())],
    ['abnormalCapexRatio', async () => computeAndWriteAbnormalCapexRatioPit(await query())],
    ['altmanZDoublePrimeScore', async () => computeAndWriteAltmanZDoublePrimeScorePit(await query())],
    ['chowderNumber', async () => computeAndWriteChowderNumberPit(await query())],
    ['consecutiveDividendYears', async () => computeAndWriteConsecutiveDividendYearsPit(await query())],
    ['dividendDistributionCount', async () => computeAndWriteDividendDistributionCountPit(await query())],
    ['famaFrenchOperatingProfitability', async () => computeAndWriteFamaFrenchOperatingProfitabilityPit(await query())],
    ['rdIntensity', async () => computeAndWriteRdIntensityPit(await query())],
    ['sue', async () => computeAndWriteSuePit(await query())],
    ['revenueCagrFamily', async () => computeAndWriteRevenueCagrFamilyPit(await query())],
    ['oneDollarTest', async () => computeAndWriteOneDollarTestPit(await query())],
    ['epsCagrFamily', async () => computeAndWriteEpsCagrFamilyPit(await query())],
    ['dividendGrowthRateFamily', async () => computeAndWriteDividendGrowthRateFamilyPit(await query())],
    ['operatingExpenseRatio', async () => computeAndWriteOperatingExpenseRatioPit(await query())],
    ['ncav', async () => computeAndWriteNcavPit(await query())],
    ['marketCap', async () => computeAndWriteMarketCapPit(await query())],
    ['pegRatio', async () => computeAndWritePegRatioPit(await query())],
    ['evToEbit', async () => computeAndWriteEvToEbitPit(await query())],
    ['evToFcf', async () => computeAndWriteEvToFcfPit(await query())],
    ['greenblattRoc', async () => computeAndWriteGreenblattRocPit(await query())],
    ['greenblattEarningsYield', async () => computeAndWriteGreenblattEarningsYieldPit(await query())],
    ['tobinsQ', async () => computeAndWriteTobinsQPit(await query())],
    ['priceToResearchRatio', async () => computeAndWritePriceToResearchRatioPit(await query())],
    ['novyMarxGpToAssets', async () => computeAndWriteNovyMarxGpToAssetsPit(await query())],
    ['croci', async () => computeAndWriteCrociPit(await query())],
    ['fcfMargin', async () => computeAndWriteFcfMarginPit(await query())],
    ['ruleOf40', async () => computeAndWriteRuleOf40Pit(await query())],
    ['netWorkingCapitalToAssets', async () => computeAndWriteNetWorkingCapitalToAssetsPit(await query())],
    ['totalDebtToCapital', async () => computeAndWriteTotalDebtToCapitalPit(await query())],
    ['nonOperatingIncomeRatio', async () => computeAndWriteNonOperatingIncomeRatioPit(await query())],
    ['equityRatio', async () => computeAndWriteEquityRatioPit(await query())],
    ['cashToAssetsRatio', async () => computeAndWriteCashToAssetsRatioPit(await query())],
    ['beneishAqi', async () => computeAndWriteBeneishAqiPit(await query())],
    ['beneishDsri', async () => computeAndWriteBeneishDsriPit(await query())],
    ['cashFlowValuationFamily', async () => computeAndWriteCashFlowValuationFamilyPit(await query())],
    ['leverageDegreeFamily', async () => computeAndWriteLeverageDegreeFamilyPit(await query())],
  ];

  if (quarter) return periodTasks; // 逐日型指標沒有「這一季」的概念，指定 quarter 時跳過，見上方說明。

  return [
    ...periodTasks,
    // 逐日型：不傳 date，函式自己解析「最新可用交易日」，只算一次不是每個歷史交易日都算。
    ['beta', async () => computeAndWriteBetaPit(await dailyQuery())],
    ['marketRatios', async () => computeAndWriteMarketRatiosPit(await dailyQuery())],
  ];
};

export const buildBankTasks = (symbol: string, quarter?: { year: string; season: '1' | '2' | '3' | '4' }): BackfillTask[] => {
  const query = async () => ({ symbol, dataType: await reportAvailability.resolveDataType(symbol), subsidiaryCompanyId: '', ...quarter });
  return [
    ['bankAssetQuality', async () => computeAndWriteBankAssetQualityFamilyPit(await query())],
    ['bankCapitalAdequacy', async () => computeAndWriteBankCapitalAdequacyFamilyPit(await query())],
    ['bankIncomeWaterfall', async () => computeAndWriteBankIncomeWaterfallPit(await query())],
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
