import { Router } from 'ultimate-express';
import { getTaiexDailyPriceHandler } from './controller';

const router = Router();

router.get('/market/taiex-daily-price', getTaiexDailyPriceHandler);

export default router;
