import { Router } from 'ultimate-express';
import { getEtfRanking } from './controller';

const router = Router();

router.get('/market/etf-ranking', getEtfRanking);

export default router;
