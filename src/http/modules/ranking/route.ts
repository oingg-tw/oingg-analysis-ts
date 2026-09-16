import { Router } from 'ultimate-express';
import { calculateRanking, type RankingDeps } from '@/application/ranking/calculateRanking';
import { jsonRoute } from '@/http/route';
import { getRankingQuerySchema } from './schemas';

// 對外路徑是 /valuation/ranking（bootstrap/httpModules.ts 用 mountPath '/valuation' 掛載）。
export const createRankingRouter = (deps: RankingDeps): Router => {
  const router = Router();

  router.get('/ranking', ...jsonRoute({ query: getRankingQuerySchema }, ({ query }) => calculateRanking(query, deps)));

  return router;
};
