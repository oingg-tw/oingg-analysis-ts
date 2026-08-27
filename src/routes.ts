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
import cashFlowPerShareRouter from './domains/cashFlow/cashFlowPerShare/route';
import ocfToNetIncomeRouter from './domains/cashFlow/ocfToNetIncome/route';
import accrualsRatioRouter from './domains/cashFlow/accrualsRatio/route';
import debtRatioRouter from './domains/solvency/debtRatio/route';
import liquidityRatioRouter from './domains/solvency/liquidityRatio/route';
import deRatioRouter from './domains/solvency/deRatio/route';
import interestCoverageRouter from './domains/solvency/interestCoverage/route';
import netDebtToEbitdaRouter from './domains/solvency/netDebtToEbitda/route';
import turnoverRatioRouter from './domains/turnover/turnoverRatio/route';
import capexToRevenueRouter from './domains/turnover/capexToRevenue/route';
import marketRatiosRouter from './domains/valuation/marketRatios/route';
import grahamNumberRouter from './domains/guru/grahamNumber/route';
import ncavRouter from './domains/guru/ncav/route';
import ownerEarningsRouter from './domains/guru/ownerEarnings/route';
import altmanZScoreRouter from './domains/guru/altmanZScore/route';
import piotroskiFScoreRouter from './domains/guru/piotroskiFScore/route';
import beneishMScoreRouter from './domains/guru/beneishMScore/route';
import betaRouter from './domains/portfolio/beta/route';

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
  roceRouter
);
apiRouter.use('/cash-flow', cashFlowPerShareRouter, ocfToNetIncomeRouter, accrualsRatioRouter);
apiRouter.use('/solvency', debtRatioRouter, liquidityRatioRouter, deRatioRouter, interestCoverageRouter, netDebtToEbitdaRouter);
apiRouter.use('/turnover', turnoverRatioRouter, capexToRevenueRouter);
apiRouter.use('/valuation', marketRatiosRouter);
apiRouter.use('/guru', grahamNumberRouter, ncavRouter, ownerEarningsRouter, altmanZScoreRouter, piotroskiFScoreRouter, beneishMScoreRouter);
apiRouter.use('/portfolio', betaRouter);

router.use(apiRouter);

export default router;
