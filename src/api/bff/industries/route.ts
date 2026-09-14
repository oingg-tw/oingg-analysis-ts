import { Router } from 'ultimate-express';
import { getIndustryTree, getIndustryFlat, getIndustryChainClassification, getIndustryChainClusters, getSecuritiesIndustrySectors } from './controller';

const router = Router();

router.get('/industries/tree', getIndustryTree);
router.get('/industries/flat', getIndustryFlat);
router.get('/industries/chain-classification', getIndustryChainClassification);
router.get('/industries/chain-clusters', getIndustryChainClusters);
router.get('/industries/securities-sectors', getSecuritiesIndustrySectors);

export default router;
