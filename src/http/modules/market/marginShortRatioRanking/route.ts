import { Router } from 'ultimate-express';
import { calculateMarginShortRatioRanking, type MarginShortRatioRankingDeps } from '@/application/market/marginShortRatioRanking/service';
import { jsonRoute } from '@/http/route';
import { getMarginShortRatioRankingQuerySchema } from './schemas';

export const createMarginShortRatioRankingRouter = (deps: MarginShortRatioRankingDeps): Router => {
  const router = Router();
  router.get('/market/margin-short-ratio-ranking', ...jsonRoute({ query: getMarginShortRatioRankingQuerySchema }, ({ query }) => calculateMarginShortRatioRanking(query, deps)));
  return router;
};
