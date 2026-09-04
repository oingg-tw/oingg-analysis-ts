import { Router } from 'ultimate-express';
import { getForeignHoldingRanking } from './controller';

const router = Router();

router.get('/market/foreign-holding-ranking', getForeignHoldingRanking);

export default router;
