import { Router } from 'ultimate-express';
import { calculatePriceChangeRanking, type PriceChangeRankingDeps } from '@/application/market/priceChangeRanking/service';
import { jsonRoute } from '@/http/route';
import { getPriceChangeRankingQuerySchema } from './schemas';

export const createPriceChangeRankingRouter = (deps: PriceChangeRankingDeps): Router => {
  const router = Router();
  router.get('/market/price-change-ranking', ...jsonRoute({ query: getPriceChangeRankingQuerySchema }, ({ query }) => calculatePriceChangeRanking(query, deps)));
  return router;
};
