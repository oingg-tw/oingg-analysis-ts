import { Router } from 'ultimate-express';
import { postScreener, getScreenerRanking, postScreenerValues } from './controller';

const router = Router();

router.post('/screener', postScreener);
router.get('/screener/ranking', getScreenerRanking);
router.post('/screener/values', postScreenerValues);

export default router;
