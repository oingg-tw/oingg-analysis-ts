import { Router } from 'ultimate-express';
import { getEquityRiskPremium } from './controller';

const router = Router();

router.get('/equity-risk-premium', getEquityRiskPremium);

export default router;
