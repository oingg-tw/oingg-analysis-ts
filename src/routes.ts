import { Router } from 'ultimate-express';
import batchRouter from './domainBatch/route';
import rootRouter from './domainApi/system/root';
import filtersRouter from './domainApi/filter/filters';
import dataCompletenessRouter from './domainApi/dataCompleteness/route';
import companiesRouter from './domainApi/companies/route';
import securitiesRouter from './domainApi/securities/route';
import stocksRouter from './domainApi/stocks/route';
import screenerRouter from './domainApi/screener/route';
import foreignHoldingRankingRouter from './domainApi/market/foreignHoldingRanking/route';
import marginShortRatioRankingRouter from './domainApi/market/marginShortRatioRanking/route';
import revenueRankingRouter from './domainApi/market/revenueRanking/route';
import volumeTop20Router from './domainApi/market/volumeTop20/route';
import disposedStocksRouter from './domainApi/market/disposedStocks/route';
import attentionStocksRouter from './domainApi/market/attentionStocks/route';
import priceLimitRangeRouter from './domainApi/market/priceLimitRange/route';
import materialAnnouncementsRouter from './domainApi/market/materialAnnouncements/route';
import priceChangeRankingRouter from './domainApi/market/priceChangeRanking/route';
import etfRankingRouter from './domainApi/market/etfRanking/route';
import etfScreenerRouter from './domainApi/market/etfScreener/route';
import roeRouter from './domainApi/metrics/profitability/roe/route';
import roaRouter from './domainApi/metrics/profitability/roa/route';
import bvpsRouter from './domainApi/metrics/profitability/bvps/route';
import epsRouter from './domainApi/metrics/profitability/eps/route';
import revenuePerShareRouter from './domainApi/metrics/profitability/revenuePerShare/route';
import marginsRouter from './domainApi/metrics/profitability/margins/route';
import dividendPayoutRatioRouter from './domainApi/metrics/profitability/dividendPayoutRatio/route';
import sgrRouter from './domainApi/metrics/profitability/sgr/route';
import roicRouter from './domainApi/metrics/profitability/roic/route';
import roceRouter from './domainApi/metrics/profitability/roce/route';
import dupontRouter from './domainApi/metrics/profitability/dupont/route';
import cashFlowPerShareRouter from './domainApi/metrics/cashFlow/cashFlowPerShare/route';
import ocfToNetIncomeRouter from './domainApi/metrics/cashFlow/ocfToNetIncome/route';
import accrualsRatioRouter from './domainApi/metrics/cashFlow/accrualsRatio/route';
import fcfYieldRouter from './domainApi/metrics/cashFlow/fcfYield/route';
import debtRatioRouter from './domainApi/metrics/solvency/debtRatio/route';
import liquidityRatioRouter from './domainApi/metrics/solvency/liquidityRatio/route';
import deRatioRouter from './domainApi/metrics/solvency/deRatio/route';
import interestCoverageRouter from './domainApi/metrics/solvency/interestCoverage/route';
import netDebtToEbitdaRouter from './domainApi/metrics/solvency/netDebtToEbitda/route';
import turnoverRatioRouter from './domainApi/metrics/turnover/turnoverRatio/route';
import capexToRevenueRouter from './domainApi/metrics/turnover/capexToRevenue/route';
import marketRatiosRouter from './domainApi/metrics/valuation/marketRatios/route';
import psrRouter from './domainApi/metrics/valuation/psr/route';
import pFcfRouter from './domainApi/metrics/valuation/pFcf/route';
import evEbitdaRouter from './domainApi/metrics/valuation/evEbitda/route';
import rankingRouter from './domainApi/metrics/valuation/ranking/route';
import grahamNumberRouter from './domainApi/metrics/guru/grahamNumber/route';
import ncavRouter from './domainApi/metrics/guru/ncav/route';
import ownerEarningsRouter from './domainApi/metrics/guru/ownerEarnings/route';
import altmanZScoreRouter from './domainApi/metrics/guru/altmanZScore/route';
import piotroskiFScoreRouter from './domainApi/metrics/guru/piotroskiFScore/route';
import beneishMScoreRouter from './domainApi/metrics/guru/beneishMScore/route';
import nissimPenmanRnoaRouter from './domainApi/metrics/guru/nissimPenmanRnoa/route';
import zmijewskiScoreRouter from './domainApi/metrics/guru/zmijewskiScore/route';
import ohlsonOScoreRouter from './domainApi/metrics/guru/ohlsonOScore/route';
import betaRouter from './domainApi/metrics/portfolio/beta/route';
import equityRiskPremiumRouter from './domainApi/metrics/macro/equityRiskPremium/route';
import govBondYield10yRouter from './domainApi/metrics/macro/govBondYield10y/route';
import maRouter from './domainApi/metrics/technicals/ma/route';
import rsiRouter from './domainApi/metrics/technicals/rsi/route';
import kdRouter from './domainApi/metrics/technicals/kd/route';
import bollingerBandsRouter from './domainApi/metrics/technicals/bollingerBands/route';
import atrRouter from './domainApi/metrics/technicals/atr/route';
import biasRouter from './domainApi/metrics/technicals/bias/route';
import macdRouter from './domainApi/metrics/technicals/macd/route';
import obvRouter from './domainApi/metrics/technicals/obv/route';

const router = Router();

// --- System & Root Routes ---
router.use(rootRouter);
router.use(filtersRouter);
router.use(dataCompletenessRouter);
router.use(companiesRouter);
router.use(securitiesRouter);
router.use(stocksRouter);
router.use(screenerRouter);
router.use(foreignHoldingRankingRouter);
router.use(marginShortRatioRankingRouter);
router.use(revenueRankingRouter);
router.use(volumeTop20Router);
router.use(disposedStocksRouter);
router.use(attentionStocksRouter);
router.use(priceLimitRangeRouter);
router.use(materialAnnouncementsRouter);
router.use(priceChangeRankingRouter);
router.use(etfRankingRouter);
router.use(etfScreenerRouter);

// --- API Routes ---
// URL 路徑跟 src/domains 底下的分類資料夾一一對應，方便維護時直接照路徑找到程式碼位置。
const apiRouter = Router();
apiRouter.use(
  '/profitability',
  roeRouter,
  roaRouter,
  bvpsRouter,
  epsRouter,
  revenuePerShareRouter,
  marginsRouter,
  dividendPayoutRatioRouter,
  sgrRouter,
  roicRouter,
  roceRouter,
  dupontRouter
);
apiRouter.use('/cash-flow', cashFlowPerShareRouter, ocfToNetIncomeRouter, accrualsRatioRouter, fcfYieldRouter);
apiRouter.use('/solvency', debtRatioRouter, liquidityRatioRouter, deRatioRouter, interestCoverageRouter, netDebtToEbitdaRouter);
apiRouter.use('/turnover', turnoverRatioRouter, capexToRevenueRouter);
apiRouter.use('/valuation', marketRatiosRouter, psrRouter, pFcfRouter, evEbitdaRouter, rankingRouter);
apiRouter.use(
  '/guru',
  grahamNumberRouter,
  ncavRouter,
  ownerEarningsRouter,
  altmanZScoreRouter,
  piotroskiFScoreRouter,
  beneishMScoreRouter,
  nissimPenmanRnoaRouter,
  zmijewskiScoreRouter,
  ohlsonOScoreRouter
);
apiRouter.use('/portfolio', betaRouter);
apiRouter.use('/macro', equityRiskPremiumRouter, govBondYield10yRouter);
apiRouter.use('/technicals', maRouter, rsiRouter, kdRouter, bollingerBandsRouter, atrRouter, biasRouter, macdRouter, obvRouter);

router.use(apiRouter);

// --- Batch Routes（給 GCP Cloud Scheduler 用，不是 BFF）---
router.use(batchRouter);

export default router;
