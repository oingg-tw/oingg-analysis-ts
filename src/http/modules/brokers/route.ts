import { Router } from 'ultimate-express';
import type { AppDeps } from '@/application/deps';
import { listBrokers } from '@/application/brokers/brokers';
import { jsonRoute } from '@/http/route';

export const createBrokersRouter = (deps: Pick<AppDeps, 'marketLists'>): Router => {
  const router = Router();
  router.get('/brokers', ...jsonRoute({}, () => listBrokers(deps)));
  return router;
};
