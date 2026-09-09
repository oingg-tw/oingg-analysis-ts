import { Router } from 'ultimate-express';
import { getQuote, getPrices, getExDividendNoticesHandler, getExDividendCalendarHandler, getForeignShareholdingHistoryHandler } from './controller';

const router = Router();

router.get('/stocks/:symbol/quote', getQuote);
router.get('/stocks/prices', getPrices);
router.get('/stocks/ex-dividend-notices', getExDividendNoticesHandler);
router.get('/stocks/ex-dividend-calendar', getExDividendCalendarHandler);
router.get('/stocks/:symbol/foreign-shareholding-history', getForeignShareholdingHistoryHandler);

export default router;
