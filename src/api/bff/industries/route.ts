import { Router } from 'ultimate-express';
import { getIndustryTree, getIndustryFlat } from './controller';

const router = Router();

router.get('/industries/tree', getIndustryTree);
router.get('/industries/flat', getIndustryFlat);

export default router;
