import { Router } from 'ultimate-express';
import { getVolumeTop20Ranking } from './controller';

const router = Router();

router.get('/market/volume-top20', getVolumeTop20Ranking);

export default router;
