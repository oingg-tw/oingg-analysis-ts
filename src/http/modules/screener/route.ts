import { Router } from 'ultimate-express';
import { postScreener, getScreenerRanking, postScreenerValues, getCompanyRank } from './controller';

const router = Router();

router.post('/screener', postScreener);
router.get('/screener/ranking', getScreenerRanking);
router.get('/screener/company-rank', getCompanyRank);
router.post('/screener/values', postScreenerValues);

export default router;
