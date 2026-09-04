import { Router } from 'ultimate-express';
import { getRanking } from './controller';

const router = Router();

router.get('/ranking', getRanking);

export default router;
