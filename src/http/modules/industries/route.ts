import { Router } from 'ultimate-express';
import { getSecuritiesIndustrySectors, getSectorDividendSummary, type IndustriesDeps } from '@/application/industries/service';
import { jsonRoute } from '@/http/route';

export const createIndustriesRouter = (deps: IndustriesDeps): Router => {
  const router = Router();

  router.get('/industries/securities-sectors', ...jsonRoute({}, () => getSecuritiesIndustrySectors(deps)));
  router.get('/industries/sector-dividend-summary', ...jsonRoute({}, () => getSectorDividendSummary(deps)));

  return router;
};
