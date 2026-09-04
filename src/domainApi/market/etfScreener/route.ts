import { Router } from 'ultimate-express';
import { postEtfScreener, getEtfScreenerFilters } from './controller';

const router = Router();

router.get('/etf-screener/filters', getEtfScreenerFilters);
router.post('/etf-screener', postEtfScreener);

export default router;
