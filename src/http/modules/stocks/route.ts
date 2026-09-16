import { Router } from 'ultimate-express';
import {
  getQuote,
  getStockSummaryHandler,
  getPrices,
  getExDividendNoticesHandler,
  getExDividendCalendarHandler,
  getForeignShareholdingHistoryHandler,
  getStockPledgeRatioHistoryHandler,
  getDailyPriceHistoryHandler,
} from './controller';

const router = Router();

router.get('/stocks/:symbol/quote', getQuote);
router.get('/stocks/:symbol/summary', getStockSummaryHandler);
router.get('/stocks/prices', getPrices);
router.get('/stocks/ex-dividend-notices', getExDividendNoticesHandler);
router.get('/stocks/ex-dividend-calendar', getExDividendCalendarHandler);
router.get('/stocks/:symbol/foreign-shareholding-history', getForeignShareholdingHistoryHandler);
router.get('/stocks/:symbol/pledge-ratio-history', getStockPledgeRatioHistoryHandler);
router.get('/stocks/:symbol/daily-price-history', getDailyPriceHistoryHandler);

export default router;
