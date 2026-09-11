// 2026-09-11 使用者要求：全市場排行需要「每支指標的最新一筆值」（不是歷史多季，那是
// 給單一公司趨勢圖用的，跟排行是不同情境，先擱置）。這支腳本涵蓋除了 marketCap/pegRatio/
// ncav/grahamNumber（已經有專屬的 backfillMarketCapNcavGrahamNumberFullMarketPit.ts）以外
// 的全部指標，一般公司清單跟銀行清單分開跑（銀行專屬指標只在真正的銀行股才有意義）。
//
// 全市場清單跟 backfillMarketCapNcavGrahamNumberFullMarketPit.ts 同一個標準：115Q2
// dataType='2' 有 XBRL 合併報表資料的公司（2,058 家）。銀行清單改成動態查
// bank_capital_adequacy_detail_xbrl 的 eligible_capital IS NOT NULL（不是隨便一列都算，
// 這張表每家公司都有列，只是非銀行業的銀行專屬欄位是 null，見 mops-ts 2026-09-11 的
// 澄清），實測只有 11 家（1409/2801/2812/2834/2836/2838/2845/2849/2897/5863/5876）。
//
// 逐日型指標（beta/exchangePeRatio+exchangePbRatio+dividendYield）刻意只算「最新一筆」
// （不傳 date，函式自己解析最新可用交易日），不是像 2330 那樣逐一歷史交易日重算——
// 使用者確認排行只需要最新值，逐日全歷史回填成本高很多倍且非必要。
//
// 用法：pnpm tsx scripts/backfillAllMetricsLatestFullMarketPit.ts

import { computeAndWriteRoePit } from '../src/domainPitMetrics/profitability/roe/computeRoePit';
import { computeAndWriteRoaPit } from '../src/domainPitMetrics/profitability/roa/computeRoaPit';
import { computeAndWriteDupontFamilyPit } from '../src/domainPitMetrics/shared/dupont/computeDupontFamilyPit';
import { computeAndWriteGrahamNumberPit } from '../src/domainPitMetrics/valuation/grahamNumber/computeGrahamNumberPit';
import { computeAndWriteOwnerEarningsPit } from '../src/domainPitMetrics/quality/ownerEarnings/computeOwnerEarningsPit';
import { computeAndWriteAltmanZScorePit } from '../src/domainPitMetrics/resilience/altmanZScore/computeAltmanZScorePit';
import { computeAndWritePiotroskiFScorePit } from '../src/domainPitMetrics/quality/piotroskiFScore/computePiotroskiFScorePit';
import { computeAndWriteBeneishMScorePit } from '../src/domainPitMetrics/quality/beneishMScore/computeBeneishMScorePit';
import { computeAndWriteNissimPenmanRnoaPit } from '../src/domainPitMetrics/profitability/nissimPenmanRnoa/computeNissimPenmanRnoaPit';
import { computeAndWriteZmijewskiScorePit } from '../src/domainPitMetrics/resilience/zmijewskiScore/computeZmijewskiScorePit';
import { computeAndWriteOhlsonOScorePit } from '../src/domainPitMetrics/resilience/ohlsonOScore/computeOhlsonOScorePit';
import { computeAndWriteMarginsFamilyPit } from '../src/domainPitMetrics/profitability/margins/computeMarginsFamilyPit';
import { computeAndWriteTurnoverRatioFamilyPit } from '../src/domainPitMetrics/efficiency/turnoverRatio/computeTurnoverRatioFamilyPit';
import { computeAndWriteEpsPit } from '../src/domainPitMetrics/profitability/eps/computeEpsPit';
import { computeAndWriteBvpsPit } from '../src/domainPitMetrics/valuation/bvps/computeBvpsPit';
import { computeAndWriteRevenuePerSharePit } from '../src/domainPitMetrics/profitability/revenuePerShare/computeRevenuePerSharePit';
import { computeAndWriteDividendPayoutRatioPit } from '../src/domainPitMetrics/dividend/dividendPayoutRatio/computeDividendPayoutRatioPit';
import { computeAndWriteSgrPit } from '../src/domainPitMetrics/growth/sgr/computeSgrPit';
import { computeAndWriteCashFlowPerSharePit } from '../src/domainPitMetrics/quality/cashFlowPerShare/computeCashFlowPerSharePit';
import { computeAndWriteOcfToNetIncomePit } from '../src/domainPitMetrics/quality/ocfToNetIncome/computeOcfToNetIncomePit';
import { computeAndWriteAccrualsRatioPit } from '../src/domainPitMetrics/quality/accrualsRatio/computeAccrualsRatioPit';
import { computeAndWriteFcfYieldPit } from '../src/domainPitMetrics/valuation/fcfYield/computeFcfYieldPit';
import { computeAndWriteDebtRatioPit } from '../src/domainPitMetrics/resilience/debtRatio/computeDebtRatioPit';
import { computeAndWriteLiquidityRatioPit } from '../src/domainPitMetrics/resilience/liquidityRatio/computeLiquidityRatioPit';
import { computeAndWriteDeRatioPit } from '../src/domainPitMetrics/resilience/deRatio/computeDeRatioPit';
import { computeAndWriteInterestCoveragePit } from '../src/domainPitMetrics/resilience/interestCoverage/computeInterestCoveragePit';
import { computeAndWriteNetDebtToEbitdaPit } from '../src/domainPitMetrics/resilience/netDebtToEbitda/computeNetDebtToEbitdaPit';
import { computeAndWriteCapexToRevenuePit } from '../src/domainPitMetrics/efficiency/capexToRevenue/computeCapexToRevenuePit';
import { computeAndWritePsrPit } from '../src/domainPitMetrics/valuation/psr/computePsrPit';
import { computeAndWritePFcfPit } from '../src/domainPitMetrics/valuation/pFcf/computePFcfPit';
import { computeAndWriteEvEbitdaPit } from '../src/domainPitMetrics/valuation/evEbitda/computeEvEbitdaPit';
import { computeAndWriteRoicPit } from '../src/domainPitMetrics/profitability/roic/computeRoicPit';
import { computeAndWriteRocePit } from '../src/domainPitMetrics/profitability/roce/computeRocePit';
import { computeAndWriteRevenueGrowthRatePit } from '../src/domainPitMetrics/growth/revenueGrowthRate/computeRevenueGrowthRatePit';
import { computeAndWriteEpsGrowthRatePit } from '../src/domainPitMetrics/growth/epsGrowthRate/computeEpsGrowthRatePit';
import { computeAndWriteNetIncomeGrowthRatePit } from '../src/domainPitMetrics/growth/netIncomeGrowthRate/computeNetIncomeGrowthRatePit';
import { computeAndWriteOperatingIncomeGrowthRatePit } from '../src/domainPitMetrics/growth/operatingIncomeGrowthRate/computeOperatingIncomeGrowthRatePit';
import { computeAndWriteEquityGrowthRatePit } from '../src/domainPitMetrics/growth/equityGrowthRate/computeEquityGrowthRatePit';
import { computeAndWriteBvpsGrowthRatePit } from '../src/domainPitMetrics/growth/bvpsGrowthRate/computeBvpsGrowthRatePit';
import { computeAndWriteAssetGrowthPit } from '../src/domainPitMetrics/growth/assetGrowth/computeAssetGrowthPit';
import { computeAndWriteConsecutiveProfitYearsPit } from '../src/domainPitMetrics/profitability/consecutiveProfitYears/computeConsecutiveProfitYearsPit';
import { computeAndWriteEarningsYieldPit } from '../src/domainPitMetrics/valuation/earningsYield/computeEarningsYieldPit';
import { computeAndWriteBuybackYieldPit } from '../src/domainPitMetrics/dividend/buybackYield/computeBuybackYieldPit';
import { computeAndWriteDividendCoverageRatioPit } from '../src/domainPitMetrics/dividend/dividendCoverageRatio/computeDividendCoverageRatioPit';
import { computeAndWriteShareCountChangeRatePit } from '../src/domainPitMetrics/dividend/shareCountChangeRate/computeShareCountChangeRatePit';
import { computeAndWriteStockPricePit } from '../src/domainPitMetrics/valuation/stockPrice/computeStockPricePit';
import { computeAndWritePeRatioPit } from '../src/domainPitMetrics/valuation/peRatio/computePeRatioPit';
import { computeAndWritePbRatioPit } from '../src/domainPitMetrics/valuation/pbRatio/computePbRatioPit';
import { computeAndWriteAbnormalCapexRatioPit } from '../src/domainPitMetrics/quality/abnormalCapexRatio/computeAbnormalCapexRatioPit';
import { computeAndWriteAltmanZPrimeScorePit } from '../src/domainPitMetrics/resilience/altmanZPrimeScore/computeAltmanZPrimeScorePit';
import { computeAndWriteAltmanZDoublePrimeScorePit } from '../src/domainPitMetrics/resilience/altmanZDoublePrimeScore/computeAltmanZDoublePrimeScorePit';
import { computeAndWriteChowderNumberPit } from '../src/domainPitMetrics/dividend/chowderNumber/computeChowderNumberPit';
import { computeAndWriteConsecutiveDividendYearsPit } from '../src/domainPitMetrics/dividend/consecutiveDividendYears/computeConsecutiveDividendYearsPit';
import { computeAndWriteFamaFrenchOperatingProfitabilityPit } from '../src/domainPitMetrics/profitability/famaFrenchOperatingProfitability/computeFamaFrenchOperatingProfitabilityPit';
import { computeAndWriteRdIntensityPit } from '../src/domainPitMetrics/growth/rdIntensity/computeRdIntensityPit';
import { computeAndWriteSuePit } from '../src/domainPitMetrics/growth/sue/computeSuePit';
import { computeAndWriteRevenueCagrFamilyPit } from '../src/domainPitMetrics/growth/revenueCagr/computeRevenueCagrFamilyPit';
import { computeAndWriteEpsCagrFamilyPit } from '../src/domainPitMetrics/growth/epsCagr/computeEpsCagrFamilyPit';
import { computeAndWriteDividendGrowthRateFamilyPit } from '../src/domainPitMetrics/dividend/dividendGrowthRate/computeDividendGrowthRateFamilyPit';
import { computeAndWriteOperatingExpenseRatioPit } from '../src/domainPitMetrics/efficiency/operatingExpenseRatio/computeOperatingExpenseRatioPit';
import { computeAndWriteBetaPit } from '../src/domainPitMetrics/valuation/beta/computeBetaPit';
import { computeAndWriteMarketRatiosPit } from '../src/domainPitMetrics/shared/marketRatios/computeMarketRatiosPit';
import { computeAndWriteBankAssetQualityFamilyPit } from '../src/domainPitMetrics/resilience/bankAssetQuality/computeBankAssetQualityFamilyPit';
import { computeAndWriteBankCapitalAdequacyFamilyPit } from '../src/domainPitMetrics/resilience/bankCapitalAdequacy/computeBankCapitalAdequacyFamilyPit';
import { upsertMetricDefinition, metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';
import { mopsExportPrisma } from '../src/adapters/prisma/mopsExportClient';
import { twseExportPrisma } from '../src/adapters/prisma/twseExportClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';

const PROGRESS_EVERY = 50;

const GENERAL_METRIC_CODES = [
  'roe', 'roa', 'dupontDecomposedRoe', 'dupontEbitMargin', 'dupontExtendedRoe', 'dupontInterestBurden', 'dupontTaxBurden',
  'grahamNumber', 'ownerEarnings', 'altmanZScore', 'piotroskiFScore', 'beneishMScore', 'nissimPenmanRnoa', 'zmijewskiScore', 'ohlsonOScore',
  'grossMargin', 'operatingMargin', 'assetTurnover', 'fixedAssetTurnover', 'inventoryDays', 'inventoryTurnover', 'payablesDays', 'payablesTurnover', 'receivablesDays', 'receivablesTurnover', 'cashConversionCycle',
  'eps', 'bvps', 'revenuePerShare', 'dividendPayoutRatio', 'sgr', 'ocfPerShare', 'fcfPerShare', 'ocfToNetIncome', 'accrualsRatio', 'fcfYield',
  'debtRatio', 'currentRatio', 'quickRatio', 'cashRatio', 'deRatio', 'interestCoverage', 'netDebtToEbitda', 'capexToRevenue', 'psr', 'pFcf', 'evEbitda', 'roic', 'roce',
  'revenueGrowthRate', 'epsGrowthRate', 'netIncomeGrowthRate', 'operatingIncomeGrowthRate', 'equityGrowthRate', 'bvpsGrowthRate',
  'assetGrowth', 'consecutiveProfitYears', 'earningsYield',
  'buybackYield', 'dividendCoverageRatio', 'shareCountChangeRate',
  'stockPrice', 'peRatio', 'pbRatio',
  'abnormalCapexRatio', 'altmanZPrimeScore', 'altmanZDoublePrimeScore',
  'chowderNumber', 'consecutiveDividendYears', 'famaFrenchOperatingProfitability', 'rdIntensity', 'sue',
  'revenueCagr3y', 'revenueCagr5y', 'revenueCagr8y', 'epsCagr3y', 'epsCagr5y', 'epsCagr8y', 'dividendGrowthRate3y', 'dividendGrowthRate5y', 'dividendGrowthRate8y',
  'operatingExpenseRatio',
  'beta', 'exchangePeRatio', 'exchangePbRatio', 'dividendYield',
];

const BANK_METRIC_CODES = ['bankNplRatio', 'bankNplCoverageRatio', 'bankCarRatio', 'bankCet1Ratio', 'bankTier1Ratio'];

const getFullMarketSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."quarterly_income_statement_xbrl"
    WHERE year = '115' AND quarter = '2' AND data_type = '2'
    ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const getBankSymbols = async (): Promise<string[]> => {
  const rows = await mopsExportPrisma.$queryRaw<{ symbol: string }[]>`
    SELECT DISTINCT symbol FROM "export"."bank_capital_adequacy_detail_xbrl" WHERE eligible_capital IS NOT NULL ORDER BY symbol
  `;
  return rows.map((r) => r.symbol);
};

const computeGeneralSymbol = async (symbol: string): Promise<void> => {
  const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };

  await computeAndWriteRoePit(query);
  await computeAndWriteRoaPit(query);
  await computeAndWriteDupontFamilyPit(query);

  await computeAndWriteGrahamNumberPit(query);
  await computeAndWriteOwnerEarningsPit(query);
  await computeAndWriteAltmanZScorePit(query);
  await computeAndWritePiotroskiFScorePit(query);
  await computeAndWriteBeneishMScorePit(query);
  await computeAndWriteNissimPenmanRnoaPit(query);
  await computeAndWriteZmijewskiScorePit(query);
  await computeAndWriteOhlsonOScorePit(query);

  await computeAndWriteMarginsFamilyPit(query);
  await computeAndWriteTurnoverRatioFamilyPit(query);

  await computeAndWriteEpsPit(query);
  await computeAndWriteBvpsPit(query);
  await computeAndWriteRevenuePerSharePit(query);
  await computeAndWriteDividendPayoutRatioPit(query);
  await computeAndWriteSgrPit(query);
  await computeAndWriteCashFlowPerSharePit(query);
  await computeAndWriteOcfToNetIncomePit(query);
  await computeAndWriteAccrualsRatioPit(query);
  await computeAndWriteFcfYieldPit(query);

  await computeAndWriteDebtRatioPit(query);
  await computeAndWriteLiquidityRatioPit(query);
  await computeAndWriteDeRatioPit(query);
  await computeAndWriteInterestCoveragePit(query);
  await computeAndWriteNetDebtToEbitdaPit(query);
  await computeAndWriteCapexToRevenuePit(query);
  await computeAndWritePsrPit(query);
  await computeAndWritePFcfPit(query);
  await computeAndWriteEvEbitdaPit(query);
  await computeAndWriteRoicPit(query);
  await computeAndWriteRocePit(query);

  await computeAndWriteRevenueGrowthRatePit(query);
  await computeAndWriteEpsGrowthRatePit(query);
  await computeAndWriteNetIncomeGrowthRatePit(query);
  await computeAndWriteOperatingIncomeGrowthRatePit(query);
  await computeAndWriteEquityGrowthRatePit(query);
  await computeAndWriteBvpsGrowthRatePit(query);

  await computeAndWriteAssetGrowthPit(query);
  await computeAndWriteConsecutiveProfitYearsPit(query);
  await computeAndWriteEarningsYieldPit(query);

  await computeAndWriteBuybackYieldPit(query);
  await computeAndWriteDividendCoverageRatioPit(query);
  await computeAndWriteShareCountChangeRatePit(query);

  await computeAndWriteStockPricePit(query);
  await computeAndWritePeRatioPit(query);
  await computeAndWritePbRatioPit(query);

  await computeAndWriteAbnormalCapexRatioPit(query);
  await computeAndWriteAltmanZPrimeScorePit(query);
  await computeAndWriteAltmanZDoublePrimeScorePit(query);

  await computeAndWriteChowderNumberPit(query);
  await computeAndWriteConsecutiveDividendYearsPit(query);
  await computeAndWriteFamaFrenchOperatingProfitabilityPit(query);
  await computeAndWriteRdIntensityPit(query);
  await computeAndWriteSuePit(query);

  await computeAndWriteRevenueCagrFamilyPit(query);
  await computeAndWriteEpsCagrFamilyPit(query);
  await computeAndWriteDividendGrowthRateFamilyPit(query);

  await computeAndWriteOperatingExpenseRatioPit(query);

  // 逐日型：不傳 date，函式自己解析「最新可用交易日」，只算一次不是每個歷史交易日都算。
  await computeAndWriteBetaPit({ symbol, dataType: '2', subsidiaryCompanyId: '' });
  await computeAndWriteMarketRatiosPit({ symbol, dataType: '2', subsidiaryCompanyId: '' });
};

const computeBankSymbol = async (symbol: string): Promise<void> => {
  const query = { symbol, dataType: '2' as const, subsidiaryCompanyId: '' };
  await computeAndWriteBankAssetQualityFamilyPit(query);
  await computeAndWriteBankCapitalAdequacyFamilyPit(query);
};

const runBatch = async (label: string, symbols: string[], fn: (symbol: string) => Promise<void>): Promise<void> => {
  console.log(`[full-market-latest-pit] ${label}：共 ${symbols.length} 家`);
  const t0 = Date.now();
  let done = 0;
  const errors: { symbol: string; error: unknown }[] = [];

  for (const symbol of symbols) {
    try {
      await fn(symbol);
    } catch (error) {
      errors.push({ symbol, error });
      console.error(`[full-market-latest-pit] ${label} ${symbol} 失敗：`, error);
    }
    done += 1;

    if (done % PROGRESS_EVERY === 0 || done === symbols.length) {
      const elapsedMs = Date.now() - t0;
      const avgMsPerSymbol = elapsedMs / done;
      const remaining = symbols.length - done;
      const etaMs = avgMsPerSymbol * remaining;
      console.log(
        `[full-market-latest-pit] ${label} 進度 ${done}/${symbols.length}（${((done / symbols.length) * 100).toFixed(1)}%）` +
          ` 已耗時 ${(elapsedMs / 60000).toFixed(1)} 分鐘，預估剩餘 ${(etaMs / 60000).toFixed(1)} 分鐘，錯誤 ${errors.length} 筆`
      );
    }
  }

  console.log(`[full-market-latest-pit] ${label} 完成，共 ${symbols.length} 家，錯誤 ${errors.length} 筆，總耗時 ${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`);
  if (errors.length > 0) {
    console.log(`[full-market-latest-pit] ${label} 錯誤清單：`, errors.map((e) => e.symbol).join(','));
  }
};

const main = async () => {
  await Promise.all(GENERAL_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));
  await Promise.all(BANK_METRIC_CODES.map((code) => upsertMetricDefinition(metricDefinitionRegistry[code]!)));

  const [generalSymbols, bankSymbols] = await Promise.all([getFullMarketSymbols(), getBankSymbols()]);

  await runBatch('一般指標（含逐日型最新快照）', generalSymbols, computeGeneralSymbol);
  await runBatch('銀行監理指標', bankSymbols, computeBankSymbol);
};

main()
  .catch((error) => {
    console.error('全市場最新一筆 backfill 腳本執行失敗：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mopsExportPrisma.$disconnect();
    await twseExportPrisma.$disconnect();
    await analysisPrisma.$disconnect();
  });
