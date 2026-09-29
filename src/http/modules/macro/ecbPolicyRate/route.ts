import { Router } from 'ultimate-express';
import { getEcbPolicyRates, type EcbPolicyRateDeps } from '@/application/macro/ecbPolicyRate/service';
import { jsonRoute } from '@/http/route';
import { ecbPolicyRateQuerySchema } from './schemas';

// 掛在 /macro 底下（見 bootstrap/httpModules.ts 的 mountPath）。
export const createEcbPolicyRateRouter = (deps: EcbPolicyRateDeps): Router => {
  const router = Router();
  router.get('/ecb-policy-rate', ...jsonRoute({ query: ecbPolicyRateQuerySchema }, ({ query }) => getEcbPolicyRates(query, deps)));
  return router;
};
