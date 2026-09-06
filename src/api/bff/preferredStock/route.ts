import { Router } from 'ultimate-express';
import { getPreferredStocks } from './controller';

const router = Router();

router.get('/preferred-stocks', getPreferredStocks);

export default router;
