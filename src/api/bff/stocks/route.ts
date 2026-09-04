import { Router } from 'ultimate-express';
import { getQuote, getPrices, getExDividendNoticesHandler } from './controller';

const router = Router();

router.get('/stocks/:symbol/quote', getQuote);
router.get('/stocks/prices', getPrices);
router.get('/stocks/ex-dividend-notices', getExDividendNoticesHandler);

export default router;
