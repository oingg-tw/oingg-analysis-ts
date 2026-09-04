import { Router } from 'ultimate-express';
import { getMarginShortRatioRanking } from './controller';

const router = Router();

router.get('/market/margin-short-ratio-ranking', getMarginShortRatioRanking);

export default router;
