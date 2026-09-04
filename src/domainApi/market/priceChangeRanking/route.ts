import { Router } from 'ultimate-express';
import { getPriceChangeRanking } from './controller';

const router = Router();

router.get('/market/price-change-ranking', getPriceChangeRanking);

export default router;
