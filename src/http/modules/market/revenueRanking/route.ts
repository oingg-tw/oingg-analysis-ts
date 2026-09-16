import { Router } from 'ultimate-express';
import { getRevenueRanking } from './controller';

const router = Router();

router.get('/market/revenue-ranking', getRevenueRanking);

export default router;
