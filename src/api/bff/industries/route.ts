import { Router } from 'ultimate-express';
import { getIndustryTree } from './controller';

const router = Router();

router.get('/industries/tree', getIndustryTree);

export default router;
