import { Router } from 'ultimate-express';
import { getSecurities } from './controller';

const router = Router();

router.get('/securities', getSecurities);

export default router;
