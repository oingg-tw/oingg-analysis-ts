import { Router } from 'ultimate-express';
import { getDisposedStocks } from './controller';

const router = Router();

router.get('/market/disposed-stocks', getDisposedStocks);

export default router;
