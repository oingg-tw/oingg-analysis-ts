import { Router } from 'ultimate-express';
import { getIndustryTree, getIndustryFlat, getSecuritiesIndustrySectors } from './controller';

const router = Router();

router.get('/industries/tree', getIndustryTree);
router.get('/industries/flat', getIndustryFlat);
router.get('/industries/securities-sectors', getSecuritiesIndustrySectors);

export default router;
