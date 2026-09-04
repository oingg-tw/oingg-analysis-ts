import { Router } from 'ultimate-express';
import { getAttentionStocks } from './controller';

const router = Router();

router.get('/market/attention-stocks', getAttentionStocks);

export default router;
