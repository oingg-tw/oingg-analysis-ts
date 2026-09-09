import { Router } from 'ultimate-express';
import { getIndustryTree, getIndustryFlat, getIndustryValueChain } from './controller';

const router = Router();

router.get('/industries/tree', getIndustryTree);
router.get('/industries/flat', getIndustryFlat);
router.get('/industries/value-chain', getIndustryValueChain);

export default router;
