import { Router } from 'ultimate-express';
import { getPreferredStocks, getPreferredStockFieldCatalog } from './controller';

const router = Router();

router.get('/preferred-stocks/field-catalog', getPreferredStockFieldCatalog);
router.get('/preferred-stocks', getPreferredStocks);

export default router;
