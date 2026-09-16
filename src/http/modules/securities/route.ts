import { Router } from 'ultimate-express';
import type { AppDeps } from '@/application/deps';
import { listSecurities } from '@/application/securities/listSecurities';
import { jsonRoute } from '@/http/route';
import { getSecuritiesQuerySchema } from './schemas';

export const createSecuritiesRouter = (deps: Pick<AppDeps, 'companyProfiles'>): Router => {
  const router = Router();

  router.get('/securities', ...jsonRoute({ query: getSecuritiesQuerySchema }, ({ query }) => listSecurities(query, deps)));

  return router;
};
