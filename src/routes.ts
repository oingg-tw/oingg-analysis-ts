import { Router } from 'ultimate-express';
import rootRouter from './domains/system/root';
import filtersRouter from './domains/filter/filters';
import dataCompletenessRouter from './domains/dataCompleteness/route';
import companiesRouter from './domains/companies/route';
import securitiesRouter from './domains/securities/route';
import stocksRouter from './domains/stocks/route';
import screenerRouter from './domains/screener/route';
import foreignHoldingRankingRouter from './domains/market/foreignHoldingRanking/route';
import marginShortRatioRankingRouter from './domains/market/marginShortRatioRanking/route';
import revenueRankingRouter from './domains/market/revenueRanking/route';
import volumeTop20Router from './domains/market/volumeTop20/route';
import disposedStocksRouter from './domains/market/disposedStocks/route';
import attentionStocksRouter from './domains/market/attentionStocks/route';
import priceLimitRangeRouter from './domains/market/priceLimitRange/route';
import materialAnnouncementsRouter from './domains/market/materialAnnouncements/route';
import priceChangeRankingRouter from './domains/market/priceChangeRanking/route';
import etfRankingRouter from './domains/market/etfRanking/route';
import etfScreenerRouter from './domains/market/etfScreener/route';
import roeRouter from './domains/metrics/profitability/roe/route';
import roaRouter from './domains/metrics/profitability/roa/route';
import bvpsRouter from './domains/metrics/profitability/bvps/route';
import epsRouter from './domains/metrics/profitability/eps/route';
import revenuePerShareRouter from './domains/metrics/profitability/revenuePerShare/route';
import marginsRouter from './domains/metrics/profitability/margins/route';
import dividendPayoutRatioRouter from './domains/metrics/profitability/dividendPayoutRatio/route';
import sgrRouter from './domains/metrics/profitability/sgr/route';
import roicRouter from './domains/metrics/profitability/roic/route';
import roceRouter from './domains/metrics/profitability/roce/route';
import dupontRouter from './domains/metrics/profitability/dupont/route';
import cashFlowPerShareRouter from './domains/metrics/cashFlow/cashFlowPerShare/route';
import ocfToNetIncomeRouter from './domains/metrics/cashFlow/ocfToNetIncome/route';
import accrualsRatioRouter from './domains/metrics/cashFlow/accrualsRatio/route';
import fcfYieldRouter from './domains/metrics/cashFlow/fcfYield/route';
import debtRatioRouter from './domains/metrics/solvency/debtRatio/route';
import liquidityRatioRouter from './domains/metrics/solvency/liquidityRatio/route';
import deRatioRouter from './domains/metrics/solvency/deRatio/route';
import interestCoverageRouter from './domains/metrics/solvency/interestCoverage/route';
import netDebtToEbitdaRouter from './domains/metrics/solvency/netDebtToEbitda/route';
import turnoverRatioRouter from './domains/metrics/turnover/turnoverRatio/route';
import capexToRevenueRouter from './domains/metrics/turnover/capexToRevenue/route';
import marketRatiosRouter from './domains/metrics/valuation/marketRatios/route';
import psrRouter from './domains/metrics/valuation/psr/route';
import pFcfRouter from './domains/metrics/valuation/pFcf/route';
import evEbitdaRouter from './domains/metrics/valuation/evEbitda/route';
import rankingRouter from './domains/metrics/valuation/ranking/route';
import grahamNumberRouter from './domains/metrics/guru/grahamNumber/route';
import ncavRouter from './domains/metrics/guru/ncav/route';
import ownerEarningsRouter from './domains/metrics/guru/ownerEarnings/route';
import altmanZScoreRouter from './domains/metrics/guru/altmanZScore/route';
import piotroskiFScoreRouter from './domains/metrics/guru/piotroskiFScore/route';
import beneishMScoreRouter from './domains/metrics/guru/beneishMScore/route';
import nissimPenmanRnoaRouter from './domains/metrics/guru/nissimPenmanRnoa/route';
import zmijewskiScoreRouter from './domains/metrics/guru/zmijewskiScore/route';
import ohlsonOScoreRouter from './domains/metrics/guru/ohlsonOScore/route';
import betaRouter from './domains/metrics/portfolio/beta/route';
import equityRiskPremiumRouter from './domains/metrics/macro/equityRiskPremium/route';
import govBondYield10yRouter from './domains/metrics/macro/govBondYield10y/route';
import maRouter from './domains/metrics/technicals/ma/route';
import rsiRouter from './domains/metrics/technicals/rsi/route';
import kdRouter from './domains/metrics/technicals/kd/route';
import bollingerBandsRouter from './domains/metrics/technicals/bollingerBands/route';
import atrRouter from './domains/metrics/technicals/atr/route';
import biasRouter from './domains/metrics/technicals/bias/route';
import macdRouter from './domains/metrics/technicals/macd/route';
import obvRouter from './domains/metrics/technicals/obv/route';

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

export default router;
