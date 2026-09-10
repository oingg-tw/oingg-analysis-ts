import { Router } from 'ultimate-express';
import {
  getCompanies,
  getCompanyProfile,
  getCompanyCapitalStockHistory,
  getCompanyRoeHistory,
  getCompanyRoaHistory,
  getCompanyDupontHistory,
  getCompanyMetricHistory,
  getCompanyMetricsHistory,
  getCompanyMonthlyRevenueHistory,
  getCompanyFinancialStatement,
  getCompanyPeerGroup,
  getCompanyPiotroskiBreakdown,
  getCompanyMetricProvenance,
} from './controller';

const router = Router();

router.get('/companies', getCompanies);
router.get('/companies/profile', getCompanyProfile);
router.get('/companies/capital-stock-history', getCompanyCapitalStockHistory);
router.get('/companies/roe-history', getCompanyRoeHistory);
router.get('/companies/roa-history', getCompanyRoaHistory);
router.get('/companies/dupont-history', getCompanyDupontHistory);
router.get('/companies/metric-history', getCompanyMetricHistory);
router.get('/companies/metrics-history', getCompanyMetricsHistory);
router.get('/companies/monthly-revenue-history', getCompanyMonthlyRevenueHistory);
router.get('/companies/financial-statement', getCompanyFinancialStatement);
router.get('/companies/peer-group', getCompanyPeerGroup);
router.get('/companies/piotroski-breakdown', getCompanyPiotroskiBreakdown);
router.get('/companies/:symbol/metric-provenance', getCompanyMetricProvenance);

export default router;
