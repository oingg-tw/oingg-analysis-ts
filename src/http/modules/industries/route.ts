import { Router } from 'ultimate-express';
import { getIndustryTree, getIndustryFlat, getSecuritiesIndustrySectors, type IndustriesDeps } from '@/application/industries/service';
import { jsonRoute } from '@/http/route';
import { getIndustryTreeQuerySchema } from './schemas';

export const createIndustriesRouter = (deps: IndustriesDeps): Router => {
  const router = Router();

  router.get('/industries/tree', ...jsonRoute({ query: getIndustryTreeQuerySchema }, ({ query }) => getIndustryTree(query.code ?? null, deps)));
  router.get('/industries/flat', ...jsonRoute({}, () => getIndustryFlat(deps)));
  router.get('/industries/securities-sectors', ...jsonRoute({}, () => getSecuritiesIndustrySectors(deps)));

  return router;
};
