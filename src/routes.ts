import { Router } from 'ultimate-express';
import rootRouter from './domains/system/root';
import filtersRouter from './domains/system/filters';
import roeRouter from './domains/profitability/roe/route';
import roaRouter from './domains/profitability/roa/route';
import bvpsRouter from './domains/profitability/bvps/route';
import epsRouter from './domains/profitability/eps/route';
import revenuePerShareRouter from './domains/profitability/revenuePerShare/route';
import marginsRouter from './domains/profitability/margins/route';
import dividendPayoutRatioRouter from './domains/profitability/dividendPayoutRatio/route';
import sgrRouter from './domains/profitability/sgr/route';
import roicRouter from './domains/profitability/roic/route';
import roceRouter from './domains/profitability/roce/route';
import dupontRouter from './domains/profitability/dupont/route';
import cashFlowPerShareRouter from './domains/cashFlow/cashFlowPerShare/route';
import ocfToNetIncomeRouter from './domains/cashFlow/ocfToNetIncome/route';
import accrualsRatioRouter from './domains/cashFlow/accrualsRatio/route';
import fcfYieldRouter from './domains/cashFlow/fcfYield/route';
import debtRatioRouter from './domains/solvency/debtRatio/route';
import liquidityRatioRouter from './domains/solvency/liquidityRatio/route';
import deRatioRouter from './domains/solvency/deRatio/route';
import interestCoverageRouter from './domains/solvency/interestCoverage/route';
import netDebtToEbitdaRouter from './domains/solvency/netDebtToEbitda/route';
import turnoverRatioRouter from './domains/turnover/turnoverRatio/route';
import capexToRevenueRouter from './domains/turnover/capexToRevenue/route';
import marketRatiosRouter from './domains/valuation/marketRatios/route';
import psrRouter from './domains/valuation/psr/route';
import pFcfRouter from './domains/valuation/pFcf/route';
import evEbitdaRouter from './domains/valuation/evEbitda/route';
import grahamNumberRouter from './domains/guru/grahamNumber/route';
import ncavRouter from './domains/guru/ncav/route';
import ownerEarningsRouter from './domains/guru/ownerEarnings/route';
import altmanZScoreRouter from './domains/guru/altmanZScore/route';
import piotroskiFScoreRouter from './domains/guru/piotroskiFScore/route';
import beneishMScoreRouter from './domains/guru/beneishMScore/route';
import nissimPenmanRnoaRouter from './domains/guru/nissimPenmanRnoa/route';
import zmijewskiScoreRouter from './domains/guru/zmijewskiScore/route';
import ohlsonOScoreRouter from './domains/guru/ohlsonOScore/route';
import betaRouter from './domains/portfolio/beta/route';
import maRouter from './domains/technicals/ma/route';
import rsiRouter from './domains/technicals/rsi/route';
import kdRouter from './domains/technicals/kd/route';
import bollingerBandsRouter from './domains/technicals/bollingerBands/route';
import atrRouter from './domains/technicals/atr/route';
import biasRouter from './domains/technicals/bias/route';
import macdRouter from './domains/technicals/macd/route';
import obvRouter from './domains/technicals/obv/route';

const router = Router();

// --- System & Root Routes ---
router.use(rootRouter);
router.use(filtersRouter);

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
apiRouter.use('/valuation', marketRatiosRouter, psrRouter, pFcfRouter, evEbitdaRouter);
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
apiRouter.use('/technicals', maRouter, rsiRouter, kdRouter, bollingerBandsRouter, atrRouter, biasRouter, macdRouter, obvRouter);

router.use(apiRouter);

export default router;
