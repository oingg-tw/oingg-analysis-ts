import { Router } from 'ultimate-express';
import { getGovBondYield10y } from './controller';

const router = Router();

router.get('/gov-bond-yield-10y', getGovBondYield10y);

export default router;
