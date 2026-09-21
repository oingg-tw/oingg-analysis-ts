import { Router } from 'ultimate-express';
import { getCbcPolicyRates, type CbcPolicyRateDeps } from '@/application/macro/cbcPolicyRate/service';
import { jsonRoute } from '@/http/route';
import { cbcPolicyRateQuerySchema } from './schemas';

// 掛在 /macro 底下（見 bootstrap/httpModules.ts 的 mountPath）。
export const createCbcPolicyRateRouter = (deps: CbcPolicyRateDeps): Router => {
  const router = Router();
  router.get('/cbc-policy-rate', ...jsonRoute({ query: cbcPolicyRateQuerySchema }, ({ query }) => getCbcPolicyRates(query, deps)));
  return router;
};
