import { Router } from 'ultimate-express';
import { calculateRevenueRanking, type RevenueRankingDeps } from '@/application/market/revenueRanking/service';
import { jsonRoute } from '@/http/route';
import { getRevenueRankingQuerySchema } from './schemas';

export const createRevenueRankingRouter = (deps: RevenueRankingDeps): Router => {
  const router = Router();
  router.get('/market/revenue-ranking', ...jsonRoute({ query: getRevenueRankingQuerySchema }, ({ query }) => calculateRevenueRanking(query, deps)));
  return router;
};
