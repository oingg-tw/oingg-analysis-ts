import { Router } from 'ultimate-express';
import { getPriceLimitRangeRanking } from './controller';

const router = Router();

router.get('/market/price-limit-range', getPriceLimitRangeRanking);

export default router;
