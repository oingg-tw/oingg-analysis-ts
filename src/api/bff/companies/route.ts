import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getCompanies, getCompanyProfile, getCompanyCapitalStockHistory, getCompanyMetrics, getCompanyRoeHistory, getCompanyPeerGroup } from './controller';

const router = Router();

router.get('/companies', getCompanies);
router.get('/companies/profile', getCompanyProfile);
router.get('/companies/capital-stock-history', getCompanyCapitalStockHistory);
router.get('/companies/roe-history', getCompanyRoeHistory);
router.get('/companies/peer-group', getCompanyPeerGroup);
registerCompanyRoute(router, '/companies/metrics', getCompanyMetrics);

export default router;
