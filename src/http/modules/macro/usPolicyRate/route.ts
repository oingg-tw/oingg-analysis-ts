import { Router } from 'ultimate-express';
import { getUsPolicyRates, type UsPolicyRateDeps } from '@/application/macro/usPolicyRate/service';
import { jsonRoute } from '@/http/route';
import { usPolicyRateQuerySchema } from './schemas';

// 掛在 /macro 底下（見 bootstrap/httpModules.ts 的 mountPath）。
export const createUsPolicyRateRouter = (deps: UsPolicyRateDeps): Router => {
  const router = Router();
  router.get('/us-policy-rate', ...jsonRoute({ query: usPolicyRateQuerySchema }, ({ query }) => getUsPolicyRates(query, deps)));
  return router;
};
