import { Router } from 'ultimate-express';
import { calculateEtfRanking, type EtfRankingDeps } from '@/application/market/etfRanking/service';
import { jsonRoute } from '@/http/route';
import { getEtfRankingQuerySchema } from './schemas';

export const createEtfRankingRouter = (deps: EtfRankingDeps): Router => {
  const router = Router();
  router.get('/market/etf-ranking', ...jsonRoute({ query: getEtfRankingQuerySchema }, ({ query }) => calculateEtfRanking(query, deps)));
  return router;
};
