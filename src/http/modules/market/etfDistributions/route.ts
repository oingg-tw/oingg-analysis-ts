import { Router } from 'ultimate-express';
import { z } from 'zod';
import { getEtfDistributions, type EtfDistributionsDeps } from '@/application/market/etfDistributions/service';
import { jsonRoute } from '@/http/route';

export const getEtfDistributionsQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: 'ETF 代號', example: '0056' }),
});

export const createEtfDistributionsRouter = (deps: EtfDistributionsDeps): Router => {
  const router = Router();
  router.get('/market/etf-distributions', ...jsonRoute({ query: getEtfDistributionsQuerySchema }, ({ query }) => getEtfDistributions(query.symbol, deps)));
  return router;
};
